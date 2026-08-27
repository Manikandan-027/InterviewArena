"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { cleanEmail, isRegisteredEmail, toRegistered, type Identity } from "@/lib/identity";
import { sfx } from "@/lib/sound";
import { Icon } from "./ui";

interface Props {
  open: boolean;
  current: Identity;
  onClose: () => void;
  onRegistered: (next: Identity) => void;
}

export default function RegisterModal({ open, current, onClose, onRegistered }: Props) {
  const [name, setName] = React.useState(current.name);
  const [email, setEmail] = React.useState(current.email);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(current.name);
      setEmail(current.email);
      setError(null);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = cleanEmail(email);
    if (name.trim().length < 2) {
      setError("Please enter your name (at least 2 characters).");
      return;
    }
    if (!isRegisteredEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.register(name.trim(), normalizedEmail);
      sfx.correct();
      onRegistered(toRegistered(current, name.trim(), res.email));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register email");
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="w-full max-w-md rounded-2xl border border-line bg-panel p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/10 text-gold">
                  <Icon name="email" size={21} />
                </span>
                <div>
                  <h3 className="font-display text-base font-bold">Register your email</h3>
                  <p className="text-xs text-mute">Score email after every round</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mute transition-colors hover:text-cream"
              >
                <Icon name="x" size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-mute">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  className="w-full rounded-xl border border-line bg-panel2 px-4 py-3 text-sm outline-none transition-colors placeholder:text-mute/60 focus:border-mint/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-mute">
                  Email address
                </label>
                <div className="flex items-center gap-2">
                  <span className="rounded-xl border border-line bg-panel2 px-3 py-3 text-sm text-mute">
                    +
                  </span>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-line bg-panel2 px-4 py-3 text-sm tabular-nums outline-none transition-colors placeholder:text-mute/60 focus:border-mint/50"
                  />
                </div>
              </div>

              {error ? (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded-xl border border-rose/30 bg-rose/10 px-3 py-2.5 text-xs text-rose"
                >
                  <Icon name="alert" size={14} /> {error}
                </motion.p>
              ) : null}

              <div className="flex items-center gap-2 rounded-xl border border-line bg-panel2 p-3 text-[11px] leading-relaxed text-mute">
                <Icon name="sparkles" size={15} className="shrink-0 text-gold" />
                You'll get a welcome email now, and a score alert after every round. Rounds from
                now on are tracked under this email address.
              </div>

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-mint py-3.5 font-display text-sm font-bold text-ink transition-transform hover:scale-[1.01] disabled:opacity-60"
              >
                <Icon name={busy ? "refresh" : "send"} size={15} className={busy ? "animate-spin" : ""} />
                {busy ? "Sending welcome email…" : "Register & send welcome email"}
              </button>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
