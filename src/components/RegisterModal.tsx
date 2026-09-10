"use client";

import * as React from "react";
import {
  motion,
  AnimatePresence,
} from "framer-motion";

import { api } from "@/lib/api";

import {
  cleanEmail,
  isRegisteredEmail,
  toRegistered,
  type Identity,
} from "@/lib/identity";

import { sfx } from "@/lib/sound";
import { Icon } from "./ui";

interface Props {
  open: boolean;
  current: Identity;
  onClose: () => void;
  onRegistered: (
    next: Identity,
  ) => void;
}

type Mode =
  | "login"
  | "register";

export default function RegisterModal({
  open,
  current,
  onClose,
  onRegistered,
}: Props) {
  const [
    mode,
    setMode,
  ] = React.useState<Mode>("login");

  const [
    name,
    setName,
  ] = React.useState("");

  const [
    email,
    setEmail,
  ] = React.useState("");

  const [
    password,
    setPassword,
  ] = React.useState("");

  /*
   * ------------------------------------------------------------
   * PASSWORD VISIBILITY
   * ------------------------------------------------------------
   */
  const [
    showPassword,
    setShowPassword,
  ] = React.useState(false);

  const [
    captchaToken,
    setCaptchaToken,
  ] = React.useState("");

  const [
    captchaQuestion,
    setCaptchaQuestion,
  ] = React.useState("");

  const [
    captchaAnswer,
    setCaptchaAnswer,
  ] = React.useState("");

  const [
    error,
    setError,
  ] = React.useState<string | null>(
    null,
  );

  const [
    busy,
    setBusy,
  ] = React.useState(false);

  const [
    captchaLoading,
    setCaptchaLoading,
  ] = React.useState(false);

  /*
   * ============================================================
   * LOAD CAPTCHA
   * ============================================================
   *
   * Every CAPTCHA is treated as fresh.
   *
   * Before requesting a new CAPTCHA we clear the old token and
   * question so an expired/used CAPTCHA can never accidentally
   * be submitted.
   */
  const loadCaptcha =
    React.useCallback(
      async () => {
        setCaptchaLoading(true);

        /*
         * Clear old CAPTCHA immediately.
         */
        setCaptchaToken("");
        setCaptchaQuestion("");
        setCaptchaAnswer("");

        try {
          const result =
            await api.captcha();

          setCaptchaToken(
            result.token,
          );

          setCaptchaQuestion(
            result.question,
          );
        } catch (err) {
          console.error(
            "CAPTCHA LOAD ERROR:",
            err,
          );

          setError(
            "Could not load CAPTCHA. Please try again.",
          );
        } finally {
          setCaptchaLoading(
            false,
          );
        }
      },
      [],
    );

  /*
   * ============================================================
   * INITIALIZE MODAL
   * ============================================================
   */
  React.useEffect(() => {
    if (!open) {
      return;
    }

    /*
     * Always start with Login.
     */
    setMode("login");

    /*
     * Restore the current user's display information.
     */
    setName(
      current.name !==
        "Candidate"
        ? current.name
        : "",
    );

    setEmail(
      current.email || "",
    );

    /*
     * Never preserve a password when
     * opening the modal.
     */
    setPassword("");

    /*
     * Password should always start hidden.
     */
    setShowPassword(false);

    /*
     * Clear CAPTCHA state before
     * requesting a new CAPTCHA.
     */
    setCaptchaToken("");
    setCaptchaQuestion("");
    setCaptchaAnswer("");

    setError(null);
    setBusy(false);

    /*
     * Load fresh CAPTCHA.
     */
    void loadCaptcha();
  }, [
    open,
    current.name,
    current.email,
    loadCaptcha,
  ]);

  /*
   * ============================================================
   * ESCAPE KEY
   * ============================================================
   */
  React.useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key === "Escape"
      ) {
        onClose();
      }
    }

    if (open) {
      window.addEventListener(
        "keydown",
        handleKeyDown,
      );
    }

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    open,
    onClose,
  ]);

  /*
   * ============================================================
   * SWITCH LOGIN / REGISTER
   * ============================================================
   */
  function switchMode(
    nextMode: Mode,
  ) {
    setMode(nextMode);

    /*
     * Never carry password from one
     * authentication mode to another.
     */
    setPassword("");

    /*
     * Reset password visibility.
     */
    setShowPassword(false);

    /*
     * Clear current CAPTCHA.
     */
    setCaptchaToken("");
    setCaptchaQuestion("");
    setCaptchaAnswer("");

    setError(null);

    /*
     * Every mode gets a fresh CAPTCHA.
     */
    void loadCaptcha();
  }

  /*
   * ============================================================
   * SUBMIT LOGIN / REGISTER
   * ============================================================
   */
  async function submit(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    const normalizedEmail =
      cleanEmail(email);

    /*
     * ----------------------------------------------------------
     * EMAIL VALIDATION
     * ----------------------------------------------------------
     */
    if (
      !isRegisteredEmail(
        normalizedEmail,
      )
    ) {
      setError(
        "Enter a valid email address.",
      );

      return;
    }

    /*
     * ----------------------------------------------------------
     * PASSWORD VALIDATION
     * ----------------------------------------------------------
     */
    if (!password) {
      setError(
        "Password is required.",
      );

      return;
    }

    /*
     * ----------------------------------------------------------
     * REGISTER VALIDATION
     * ----------------------------------------------------------
     */
    if (
      mode === "register"
    ) {
      if (
        name.trim().length < 2
      ) {
        setError(
          "Please enter your name.",
        );

        return;
      }

      if (
        password.length < 8 ||
        !/[A-Za-z]/.test(
          password,
        ) ||
        !/\d/.test(
          password,
        )
      ) {
        setError(
          "Password must be at least 8 characters and contain at least one letter and one number.",
        );

        return;
      }
    }

    /*
     * ----------------------------------------------------------
     * CAPTCHA VALIDATION
     * ----------------------------------------------------------
     */
    if (
      !captchaToken ||
      !captchaAnswer.trim()
    ) {
      setError(
        "Please solve the CAPTCHA.",
      );

      return;
    }

    setBusy(true);
    setError(null);

    try {
      /*
       * ========================================================
       * LOGIN
       * ========================================================
       */
      if (
        mode === "login"
      ) {
        const result =
          await api.login(
            normalizedEmail,
            password,
            captchaToken,
            captchaAnswer.trim(),
          );

        sfx.correct();

        const next =
          toRegistered(
            current,
            result.name,
            result.email,
          );

        onRegistered(next);

        return;
      }

      /*
       * ========================================================
       * REGISTER
       * ========================================================
       */
      const result =
        await api.register(
          name.trim(),
          normalizedEmail,
          password,
          captchaToken,
          captchaAnswer.trim(),
        );

      sfx.correct();

      const next =
        toRegistered(
          current,
          result.name,
          result.email,
        );

      onRegistered(next);
    } catch (err) {
      console.error(
        "AUTH ERROR:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Authentication failed. Please try again.",
      );

      /*
       * CAPTCHA is single-use.
       *
       * If login/register fails, discard
       * the previous CAPTCHA and generate
       * a completely fresh one.
       */
      await loadCaptcha();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: 1,
          }}
          exit={{
            opacity: 0,
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{
              opacity: 0,
              scale: 0.94,
              y: 14,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: 8,
            }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 22,
            }}
            className="w-full max-w-md rounded-2xl border border-line bg-panel p-6"
            onClick={(event) =>
              event.stopPropagation()
            }
            role="dialog"
            aria-modal="true"
          >
            {/* =================================================
                HEADER
               ================================================= */}

            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/10 text-gold">
                  <Icon
                    name="email"
                    size={21}
                  />
                </span>

                <div>
                  <h3 className="font-display text-base font-bold">
                    {mode === "login"
                      ? "Welcome back"
                      : "Create your account"}
                  </h3>

                  <p className="text-xs text-mute">
                    {mode === "login"
                      ? "Login to continue to InterviewArena"
                      : "Register for a secure InterviewArena account"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mute transition-colors hover:text-cream"
                aria-label="Close"
              >
                <Icon
                  name="x"
                  size={14}
                />
              </button>
            </div>

            {/* =================================================
                LOGIN / REGISTER TABS
               ================================================= */}

            <div className="mt-5 grid grid-cols-2 rounded-xl border border-line bg-panel2 p-1">
              <button
                type="button"
                onClick={() =>
                  switchMode(
                    "login",
                  )
                }
                className={`rounded-lg py-2.5 text-xs font-bold transition-colors ${
                  mode === "login"
                    ? "bg-mint text-ink"
                    : "text-mute hover:text-cream"
                }`}
              >
                Login
              </button>

              <button
                type="button"
                onClick={() =>
                  switchMode(
                    "register",
                  )
                }
                className={`rounded-lg py-2.5 text-xs font-bold transition-colors ${
                  mode === "register"
                    ? "bg-mint text-ink"
                    : "text-mute hover:text-cream"
                }`}
              >
                Register
              </button>
            </div>

            {/* =================================================
                FORM
               ================================================= */}

            <form
              onSubmit={submit}
              className="mt-5 space-y-4"
            >
              {/* =================================================
                  NAME — REGISTER ONLY
                 ================================================= */}

              {mode ===
              "register" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-mute">
                    Full name
                  </label>

                  <input
                    value={name}
                    onChange={(event) =>
                      setName(
                        event.target
                          .value,
                      )
                    }
                    type="text"
                    autoComplete="name"
                    placeholder="Your full name"
                    className="w-full rounded-xl border border-line bg-panel2 px-4 py-3 text-sm outline-none transition-colors placeholder:text-mute/60 focus:border-mint/50"
                  />
                </div>
              ) : null}

              {/* =================================================
                  EMAIL
                 ================================================= */}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-mute">
                  Email address
                </label>

                <input
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target
                        .value,
                    )
                  }
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-line bg-panel2 px-4 py-3 text-sm outline-none transition-colors placeholder:text-mute/60 focus:border-mint/50"
                />
              </div>

              {/* =================================================
                  PASSWORD
                 ================================================= */}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-mute">
                  Password
                </label>

                {/* Password input + eye button */}
                <div className="relative">
                  <input
                    value={password}
                    onChange={(event) =>
                      setPassword(
                        event.target
                          .value,
                      )
                    }
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    autoComplete={
                      mode === "login"
                        ? "current-password"
                        : "new-password"
                    }
                    placeholder={
                      mode === "login"
                        ? "Enter your password"
                        : "At least 8 characters"
                    }
                    className="w-full rounded-xl border border-line bg-panel2 px-4 py-3 pr-12 text-sm outline-none transition-colors placeholder:text-mute/60 focus:border-mint/50"
                  />

                  {/* =================================================
                      EYE BUTTON
                     ================================================= */}

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (
                          value,
                        ) =>
                          !value,
                      )
                    }
                    className="absolute right-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-mute transition-colors hover:bg-white/5 hover:text-cream"
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    title={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showPassword ? (
                      /*
                       * EYE OFF
                       */
                      <svg
                        width="19"
                        height="19"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 3l18 18" />

                        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />

                        <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5 0 8.5 4 10 8a16.7 16.7 0 0 1-3.2 4.8" />

                        <path d="M6.6 6.6C4.8 7.8 3.5 9.7 2 12c1.5 4 5 8 10 8a10.7 10.7 0 0 0 4.1-.8" />
                      </svg>
                    ) : (
                      /*
                       * NORMAL EYE
                       */
                      <svg
                        width="19"
                        height="19"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />

                        <circle
                          cx="12"
                          cy="12"
                          r="3"
                        />
                      </svg>
                    )}
                  </button>
                </div>

                {mode ===
                "register" ? (
                  <p className="mt-1 text-[10px] text-mute">
                    Minimum 8 characters
                    with at least one
                    letter and one number.
                  </p>
                ) : null}
              </div>

              {/* =================================================
                  CAPTCHA
                 ================================================= */}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-mute">
                  Security check
                </label>

                <div className="flex gap-2">
                  {/* CAPTCHA QUESTION */}

                  <div className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-line bg-panel2 px-4 font-mono text-sm font-bold tracking-widest text-cream">
                    {captchaLoading
                      ? "Loading..."
                      : captchaQuestion ||
                        "—"}
                  </div>

                  {/* REFRESH CAPTCHA */}

                  <button
                    type="button"
                    onClick={() =>
                      void loadCaptcha()
                    }
                    disabled={
                      captchaLoading ||
                      busy
                    }
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-panel2 text-lg text-mute transition-colors hover:text-cream disabled:opacity-50"
                    aria-label="Refresh CAPTCHA"
                    title="Refresh CAPTCHA"
                  >
                    ↻
                  </button>
                </div>

                {/* CAPTCHA ANSWER */}

                <input
                  value={
                    captchaAnswer
                  }
                  onChange={(event) =>
                    setCaptchaAnswer(
                      event.target
                        .value,
                    )
                  }
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Enter CAPTCHA answer"
                  className="mt-2 w-full rounded-xl border border-line bg-panel2 px-4 py-3 text-sm outline-none transition-colors placeholder:text-mute/60 focus:border-mint/50"
                />
              </div>

              {/* =================================================
                  ERROR
                 ================================================= */}

              {error ? (
                <motion.div
                  initial={{
                    opacity: 0,
                    y: -4,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  className="flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/10 px-3 py-2.5 text-xs text-rose"
                >
                  <Icon
                    name="alert"
                    size={14}
                  />

                  <span>
                    {error}
                  </span>
                </motion.div>
              ) : null}

              {/* =================================================
                  SECURITY MESSAGE
                 ================================================= */}

              <div className="rounded-xl border border-line bg-panel2 p-3 text-[11px] leading-relaxed text-mute">
                <Icon
                  name="sparkles"
                  size={14}
                  className="mr-2 inline text-gold"
                />

                Your password is
                securely hashed on the
                server and is never
                stored in your browser.
              </div>

              {/* =================================================
                  SUBMIT BUTTON
                 ================================================= */}

              <button
                type="submit"
                disabled={
                  busy ||
                  captchaLoading
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-mint py-3.5 font-display text-sm font-bold text-ink transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon
                  name={
                    busy
                      ? "refresh"
                      : mode ===
                          "login"
                        ? "send"
                        : "send"
                  }
                  size={15}
                  className={
                    busy
                      ? "animate-spin"
                      : ""
                  }
                />

                {busy
                  ? mode ===
                    "login"
                    ? "Signing in..."
                    : "Creating account..."
                  : mode ===
                      "login"
                    ? "Login"
                    : "Create account"}
              </button>
            </form>

            {/* =================================================
                FOOTER
               ================================================= */}

            <p className="mt-4 text-center text-[10px] leading-relaxed text-mute">
              {mode === "login"
                ? "Don't have an account? Click Register above to create one."
                : "Already have an account? Click Login above to sign in."}
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}