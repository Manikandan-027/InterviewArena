"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { SECTIONS, sectionByKey, type SectionMeta } from "@/lib/sections";
import { sfx } from "@/lib/sound";
import { fmtDuration } from "@/lib/format";
import type {
  CategoryKey,
  GradedResult,
  Question,
  Stats,
  SubmitResponse,
} from "@/lib/types";
import type { Identity } from "@/lib/identity";
import {
  Bar,
  Confetti,
  FadeIn,
  Icon,
  ProgressRing,
  Skel,
  useCountUp,
} from "./ui";

type Phase = "pick" | "loading" | "quiz" | "result";

interface Props {
  identity: Identity;
  stats: Stats | null;
  startSection: CategoryKey | null;
  onStarted: () => void;
  onRoundComplete: (info: {
    category: CategoryKey;
    accuracy: number;
    emailSent: boolean;
  }) => void;
  onNotify: (kind: "success" | "error" | "info", text: string) => void;
  goTab: (tab: "dashboard" | "history" | "email" | "practice") => void;
}

interface AnswerRec {
  questionId: number;
  answer: number;
  timeTakenMs: number;
}

export default function Practice({
  identity,
  stats,
  startSection,
  onStarted,
  onRoundComplete,
  onNotify,
  goTab,
}: Props) {
  const [phase, setPhase] = React.useState<Phase>("pick");
  const [section, setSection] = React.useState<SectionMeta | null>(null);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [qIndex, setQIndex] = React.useState(0);
  const [roundNo, setRoundNo] = React.useState(0);
  const [chosen, setChosen] = React.useState<number | null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [answers, setAnswers] = React.useState<AnswerRec[]>([]);
  const [timeLeft, setTimeLeft] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<SubmitResponse | null>(null);
  const roundStartRef = React.useRef(0);

  const q = questions[qIndex];

  async function startRound(key: CategoryKey) {
    const meta = sectionByKey(key);
    setSection(meta);
    setPhase("loading");
    setResult(null);
    sfx.click();
    try {
      const res = await api.fetchRound(key);
      setQuestions(res.questions);
      setQIndex(0);
      setChosen(null);
      setRevealed(false);
      setAnswers([]);
      setRoundNo((n) => n + 1);
      setTimeLeft((res.questions[0]?.timeLimit ?? 40) * 1000);
      roundStartRef.current = Date.now();
      setPhase("quiz");
    } catch (e) {
      onNotify("error", e instanceof Error ? e.message : "Could not load questions");
      setPhase("pick");
    }
  }

  // External "practice this section" trigger (e.g. from the Missed notebook)
  React.useEffect(() => {
    if (startSection) {
      void startRound(startSection);
      onStarted();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSection]);

  // Per-question countdown
  React.useEffect(() => {
    if (phase !== "quiz" || revealed || !q) return;
    const t = window.setInterval(() => {
      setTimeLeft((ms) => ms - 100);
    }, 100);
    return () => window.clearInterval(t);
  }, [phase, revealed, qIndex, q]);

  React.useEffect(() => {
    if (phase !== "quiz" || revealed || !q) return;
    if (timeLeft <= 0) {
      setRevealed(true);
      sfx.timeout();
      setAnswers((a) => [
        ...a,
        { questionId: q.id, answer: -1, timeTakenMs: q.timeLimit * 1000 },
      ]);
    }
  }, [timeLeft, phase, revealed, q]);

  // Stop audio whenever the question or phase changes
  React.useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [qIndex, phase, roundNo]);

  function pick(i: number) {
    if (phase !== "quiz" || revealed || !q) return;
    const ok = i === q.correctIndex;
    if (ok) sfx.correct();
    else sfx.wrong();
    setChosen(i);
    setRevealed(true);
    const timeTaken = Math.max(0, q.timeLimit * 1000 - Math.max(0, timeLeft));
    setAnswers((a) => [...a, { questionId: q.id, answer: i, timeTakenMs: timeTaken }]);
  }

  async function next() {
    if (phase !== "quiz" || !revealed) return;
    sfx.click();
    if (qIndex + 1 < questions.length) {
      const nq = questions[qIndex + 1];
      setChosen(null);
      setRevealed(false);
      setTimeLeft(nq.timeLimit * 1000);
      setQIndex((i) => i + 1);
      return;
    }
    setSubmitting(true);
    const durationMs = Date.now() - roundStartRef.current;
    try {
      const res = await api.submitRound({
        userId: identity.id,
        category: q.category,
        durationMs,
        email: identity.email,
        results: answers,
      });
      setResult(res);
      setPhase("result");
      sfx.finish(res.attempt.accuracy >= 70);
      onRoundComplete({
        category: q.category,
        accuracy: res.attempt.accuracy,
        emailSent: res.attempt.emailSent,
      });
    } catch (e) {
      onNotify("error", e instanceof Error ? e.message : "Could not save your round");
      setPhase("pick");
    } finally {
      setSubmitting(false);
    }
  }

  /* ------------------------------- PICK ------------------------------- */
  if (phase === "pick") {
    return (
      <div>
        <FadeIn>
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint/10 text-mint">
              <Icon name="refresh" size={17} />
            </span>
            <div>
              <p className="font-display text-sm font-semibold">
                Fresh questions every round
              </p>
              <p className="text-xs text-mute">
                Finish a round and instantly get a new set — recently asked questions never repeat.
              </p>
            </div>
          </div>
        </FadeIn>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.map((s, i) => {
            const st = stats?.byCategory.find((c) => c.category === s.key);
            return (
              <motion.button
                key={s.key}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.35 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => void startRound(s.key)}
                className="group relative overflow-hidden rounded-2xl border border-line bg-panel p-5 text-left transition-colors hover:border-line2"
              >
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-60 blur-2xl transition-opacity group-hover:opacity-100"
                  style={{ background: s.soft }}
                />
                <div className="flex items-start justify-between">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: s.soft, color: s.accent }}
                  >
                    <Icon name={s.icon} size={22} />
                  </span>
                  <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-mute">
                    {s.questionCount} Qs
                  </span>
                </div>
                <h3 className="mt-4 font-display text-base font-semibold">{s.label}</h3>
                <p className="mt-1 text-xs leading-relaxed text-mute">{s.blurb}</p>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-mute">
                    {st && st.rounds > 0 ? (
                      <span>
                        <span className="font-semibold" style={{ color: s.accent }}>
                          {st.accuracy}%
                        </span>{" "}
                        avg · best{" "}
                        <span className="font-semibold text-cream">{st.bestScore}</span>
                      </span>
                    ) : (
                      <span>Not attempted yet</span>
                    )}
                  </div>
                  <span
                    className="flex items-center gap-1 text-xs font-semibold"
                    style={{ color: s.accent }}
                  >
                    Start <Icon name="chevron" size={14} />
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ------------------------------ LOADING ------------------------------ */
  if (phase === "loading") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-line bg-panel p-8">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 animate-pulse items-center justify-center rounded-xl"
              style={{
                background: section?.soft ?? "#141b18",
                color: section?.accent ?? "#8ca49a",
              }}
            >
              <Icon name={section?.icon ?? "target"} size={20} />
            </span>
            <div>
              <p className="font-display text-sm font-semibold">
                Pulling a fresh set of {section?.short} questions…
              </p>
              <p className="text-xs text-mute">
                Checking the bank for questions you haven't seen recently.
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <Skel className="h-5 w-2/3" />
            <Skel className="h-11 w-full" />
            <Skel className="h-11 w-full" />
            <Skel className="h-11 w-full" />
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------- RESULT ------------------------------ */
  if (phase === "result" && result) {
    return (
      <ResultView
        result={result}
        section={section}
        questions={questions}
        answers={answers}
        onNewRound={() => section && void startRound(section.key)}
        onPick={() => setPhase("pick")}
        goTab={goTab}
      />
    );
  }

  /* -------------------------------- QUIZ ------------------------------- */
  if (phase === "quiz" && q && section) {
    const total = questions.length;
    const correctSoFar = answers.filter(
      (a, i) => a.answer === questions[i]?.correctIndex,
    ).length;
    const secs = Math.max(0, Math.ceil(timeLeft / 1000));
    const frac = Math.max(0, Math.min(1, timeLeft / (q.timeLimit * 1000)));
    const isListening = q.category === "listening";
    return (
      <div className="mx-auto max-w-2xl">
        {/* Round process tracker */}
        <div className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPhase("pick")}
              title="Exit round"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mute transition-colors hover:border-rose/50 hover:text-rose"
            >
              <Icon name="x" size={15} />
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: section.soft, color: section.accent }}
              >
                <Icon name={section.icon} size={14} />
              </span>
              <p className="truncate font-display text-sm font-semibold">
                {section.short}
                <span className="ml-1.5 text-xs font-normal text-mute">
                  · round {roundNo}
                </span>
              </p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="rounded-full border border-line px-2.5 py-1 text-xs tabular-nums text-mute">
                <span className="font-bold text-mint">{correctSoFar}</span>/{total} right
              </span>
              <ProgressRing
                size={44}
                stroke={4}
                value={frac}
                color={frac > 0.3 ? "#34d399" : "#fb7185"}
              >
                <span
                  className="font-display text-xs font-bold tabular-nums"
                  style={{ color: frac > 0.3 ? "#e9f1eb" : "#fb7185" }}
                >
                  {secs}
                </span>
              </ProgressRing>
            </div>
          </div>
          {/* Steps + progress */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {questions.map((qq, i) => {
                const done = answers.length > i;
                const ok = done && answers[i]?.answer === qq.correctIndex;
                const current = i === qIndex && !revealed;
                return (
                  <div
                    key={qq.id}
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold transition-all ${
                      current ? "step-active border-mint bg-mint/15 text-mint" : ""
                    } ${
                      done
                        ? ok
                          ? "border-mint/60 bg-mint/10 text-mint"
                          : "border-rose/60 bg-rose/10 text-rose"
                        : "border-line bg-panel2 text-mute"
                    }`}
                  >
                    {done ? (
                      <Icon name={ok ? "check" : "x"} size={11} strokeWidth={2.6} />
                    ) : (
                      i + 1
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex-1">
              <Bar
                value={(qIndex + (revealed ? 1 : 0)) / total}
                color={section.accent}
                height={5}
              />
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-mute">
              Q {Math.min(qIndex + 1, total)}/{total}
            </span>
          </div>
        </div>

        {/* Question card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${roundNo}-${q.id}`}
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -26 }}
            transition={{ duration: 0.25 }}
            className="mt-4 rounded-2xl border border-line bg-panel p-5 sm:p-6"
          >
            {q.passageText && q.category === "reading" ? (
              <div
                className="thin-scroll mb-4 max-h-52 overflow-y-auto rounded-xl border p-4"
                style={{ borderColor: `${section.accent}33`, background: section.soft }}
              >
                <p
                  className="mb-2 text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: section.accent }}
                >
                  Passage — read once, then answer
                </p>
                <p className="text-xs leading-relaxed text-cream/90">{q.passageText}</p>
              </div>
            ) : null}

            {isListening && q.passageText ? (
              <AudioPlayer key={q.id} text={q.passageText} accent={section.accent} />
            ) : null}

            <div className="mb-3 flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: section.soft, color: section.accent }}
              >
                Difficulty {q.difficulty}
              </span>
              <span className="text-[11px] text-mute">{q.timeLimit}s per question</span>
            </div>

            <h3 className="font-display text-base font-semibold leading-relaxed sm:text-lg">
              {q.prompt}
            </h3>

            <div className="mt-4 space-y-2.5">
              {q.options.map((opt, i) => {
                const isCorrect = revealed && i === q.correctIndex;
                const isWrongPick = revealed && i === chosen && i !== q.correctIndex;
                const dim = revealed && !isCorrect && !isWrongPick;
                return (
                  <motion.button
                    key={i}
                    whileHover={revealed ? undefined : { x: 4 }}
                    whileTap={revealed ? undefined : { scale: 0.99 }}
                    disabled={revealed}
                    onClick={() => pick(i)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      isCorrect
                        ? "border-mint/60 bg-mint/10"
                        : isWrongPick
                          ? "border-rose/60 bg-rose/10"
                          : dim
                            ? "border-line bg-panel2 opacity-50"
                            : "border-line bg-panel2 hover:border-line2"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold ${
                        isCorrect
                          ? "bg-mint/20 text-mint"
                          : isWrongPick
                            ? "bg-rose/20 text-rose"
                            : "bg-cream/5 text-mute"
                      }`}
                    >
                      {isCorrect ? (
                        <Icon name="check" size={14} strokeWidth={2.6} />
                      ) : isWrongPick ? (
                        <Icon name="x" size={13} strokeWidth={2.6} />
                      ) : (
                        String.fromCharCode(65 + i)
                      )}
                    </span>
                    <span className="leading-relaxed">{opt}</span>
                  </motion.button>
                );
              })}
            </div>

            <AnimatePresence>
              {revealed ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 rounded-xl border border-line bg-panel2 p-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${
                          chosen === q.correctIndex
                            ? "bg-mint/15 text-mint"
                            : "bg-rose/15 text-rose"
                        }`}
                      >
                        <Icon
                          name={
                            chosen === q.correctIndex
                              ? "check"
                              : chosen === null
                                ? "clock"
                                : "x"
                          }
                          size={13}
                          strokeWidth={2.4}
                        />
                      </span>
                      <p className="font-display text-sm font-semibold">
                        {chosen === q.correctIndex
                          ? "Correct — nice work"
                          : chosen === null
                            ? "Time's up"
                            : "Not quite"}
                      </p>
                      {chosen === q.correctIndex ? (
                        <span className="ml-auto text-[11px] font-semibold text-gold">
                          +speed bonus
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-mute">
                      {q.explanation}
                    </p>
                    <div className="mt-4 flex justify-end">
                      <motion.button
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.12 }}
                        disabled={submitting}
                        onClick={() => void next()}
                        className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-display text-sm font-bold text-ink transition-transform hover:scale-[1.02]"
                        style={{ background: section.accent, opacity: submitting ? 0.6 : 1 }}
                      >
                        {submitting ? (
                          <>Saving…</>
                        ) : qIndex + 1 < total ? (
                          <>
                            Next question <Icon name="chevron" size={15} />
                          </>
                        ) : (
                          <>
                            Finish & see score <Icon name="trophy" size={15} />
                          </>
                        )}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return null;
}

/* -------------------------------- Result view ------------------------------ */

function ResultView({
  result,
  section,
  questions,
  answers,
  onNewRound,
  onPick,
  goTab,
}: {
  result: SubmitResponse;
  section: SectionMeta | null;
  questions: Question[];
  answers: AnswerRec[];
  onNewRound: () => void;
  onPick: () => void;
  goTab: (tab: "dashboard" | "history" | "email" | "practice") => void;
}) {
  const [showTranscript, setShowTranscript] = React.useState(false);
  const a = result.attempt;
  const accent = section?.accent ?? "#34d399";
  const good = a.accuracy >= 70;
  const score = useCountUp(a.score, 1100);
  const acc = useCountUp(a.accuracy, 1100);
  const passageText = questions[0]?.passageText ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <FadeIn>
        <div className="relative overflow-hidden rounded-2xl border border-line bg-panel p-6 sm:p-8">
          {good && <Confetti colors={[accent, "#34d399", "#f5b64a", "#e9f1eb"]} />}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: accent }}
              >
                {section?.label} · round complete
              </p>
              <div className="mt-2 flex items-end gap-2">
                <span className="font-display text-5xl font-bold tabular-nums">{score}</span>
                <span className="mb-1.5 text-sm text-mute">pts</span>
              </div>
            </div>
            <ProgressRing size={92} stroke={8} value={a.accuracy / 100} color={accent}>
              <div className="text-center">
                <p className="font-display text-xl font-bold tabular-nums">{acc}%</p>
                <p className="text-[10px] uppercase tracking-wide text-mute">accuracy</p>
              </div>
            </ProgressRing>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: `${accent}22`, color: accent }}
            >
              {a.rating}
            </span>
            <span className="rounded-full border border-line px-3 py-1 text-xs text-cream">
              {a.correct}/{a.total} correct
            </span>
            <span className="rounded-full border border-line px-3 py-1 text-xs text-cream">
              {fmtDuration(a.durationMs)}
            </span>
            {a.emailSent ? (
              <span className="flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint/10 px-3 py-1 text-xs text-mint">
                <Icon name="email" size={12} /> Score Email sent
              </span>
            ) : null}
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onNewRound}
              className="flex items-center gap-2 rounded-xl px-5 py-3 font-display text-sm font-bold text-ink"
              style={{ background: accent }}
            >
              <Icon name="refresh" size={16} /> New round — fresh questions
            </motion.button>
            <button
              onClick={onPick}
              className="rounded-xl border border-line bg-panel2 px-5 py-3 text-sm font-semibold text-cream transition-colors hover:border-line2"
            >
              Change section
            </button>
            <button
              onClick={() => goTab("dashboard")}
              className="rounded-xl px-4 py-3 text-sm font-medium text-mute transition-colors hover:text-cream"
            >
              Dashboard
            </button>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="mt-4 rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <h4 className="font-display text-sm font-semibold">Question review</h4>
          <ul className="mt-4 space-y-3">
            {questions.map((qq) => {
              const g: GradedResult | undefined = result.results.find(
                (r) => r.questionId === qq.id,
              );
              const my = answers.find((r) => r.questionId === qq.id)?.answer;
              const ok = g?.correct ?? false;
              return (
                <li key={qq.id} className="rounded-xl border border-line bg-panel2 p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                      style={{
                        background: ok
                          ? "rgba(52,211,153,0.15)"
                          : "rgba(251,113,133,0.15)",
                        color: ok ? "#34d399" : "#fb7185",
                      }}
                    >
                      <Icon name={ok ? "check" : "x"} size={13} strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-relaxed">{qq.prompt}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-md bg-rose/10 px-2 py-1 text-rose">
                          You: {my != null && my >= 0 ? qq.options[my] : "Skipped"}
                        </span>
                        <span className="rounded-md bg-mint/10 px-2 py-1 text-mint">
                          Correct: {qq.options[qq.correctIndex]}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-mute">
                        <span className="font-semibold text-cream">Why: </span>
                        {g?.explanation ?? qq.explanation}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {passageText ? (
            <div className="mt-4">
              <button
                onClick={() => setShowTranscript((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-mute transition-colors hover:text-cream"
              >
                <Icon name={showTranscript ? "x" : "doc"} size={13} />
                {showTranscript ? "Hide" : "Show"} the{" "}
                {section?.key === "listening" ? "audio transcript" : "passage"}
              </button>
              <AnimatePresence>
                {showTranscript ? (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="thin-scroll mt-2 max-h-44 overflow-y-auto rounded-xl border border-line bg-panel2 p-4 text-xs leading-relaxed text-mute"
                  >
                    {passageText}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      </FadeIn>
    </div>
  );
}

/* ------------------------------- Audio player ------------------------------ */

function AudioPlayer({ text, accent }: { text: string; accent: string }) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [status, setStatus] = React.useState<"idle" | "playing" | "paused">("idle");
  const [rate, setRate] = React.useState(1);

  function speak(r: number) {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = r;
    u.onend = () => setStatus("idle");
    u.onerror = () => setStatus("idle");
    window.speechSynthesis.speak(u);
    setStatus("playing");
  }

  function toggle() {
    if (!supported) return;
    if (status === "playing") {
      window.speechSynthesis.pause();
      setStatus("paused");
    } else if (status === "paused") {
      window.speechSynthesis.resume();
      setStatus("playing");
    } else {
      speak(rate);
    }
  }

  function changeRate(r: number) {
    setRate(r);
    if (status !== "idle") speak(r);
  }

  React.useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  if (!supported) {
    return (
      <div className="mb-4 rounded-xl border border-gold/30 bg-gold/10 p-4 text-xs text-gold">
        Your browser can't play audio — transcript shown instead:{" "}
        <span className="text-cream/90">{text}</span>
      </div>
    );
  }

  return (
    <div
      className="mb-4 rounded-xl border p-4"
      style={{ borderColor: `${accent}33`, background: "rgba(232,240,234,0.03)" }}
    >
      <div className="flex items-center gap-4">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={toggle}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink"
          style={{ background: accent }}
          title={status === "playing" ? "Pause" : "Play"}
        >
          <Icon name={status === "playing" ? "pause" : "play"} size={20} strokeWidth={2.2} />
        </motion.button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-mint">
              <Icon name="volume" size={15} />
            </span>
            <p className="truncate font-display text-sm font-semibold">
              {status === "playing"
                ? "Playing brief…"
                : status === "paused"
                  ? "Paused"
                  : "Tap play to hear the brief"}
            </p>
            <span className={`wave ${status === "playing" ? "" : "paused"} text-mint`}>
              <span />
              <span />
              <span />
              <span />
              <span />
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-mute">
            Transcript stays hidden until you finish the round.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {[0.9, 1, 1.2].map((r) => (
            <button
              key={r}
              onClick={() => changeRate(r)}
              className={`rounded-lg px-2 py-1 text-[11px] font-bold tabular-nums transition-colors ${
                rate === r ? "bg-cream/10 text-cream" : "text-mute hover:text-cream"
              }`}
            >
              {r}×
            </button>
          ))}
          <button
            onClick={() => speak(rate)}
            title="Replay"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg border border-line text-mute transition-colors hover:text-cream"
          >
            <Icon name="replay" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
