"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { SECTIONS, sectionByKey } from "@/lib/sections";
import { levelFor, timeAgo } from "@/lib/format";
import type { CategoryKey, Stats } from "@/lib/types";
import type { Identity } from "@/lib/identity";
import { Bar, EmptyState, FadeIn, Icon, Skel, useCountUp } from "./ui";

interface Props {
  identity: Identity;
  stats: Stats | null;
  loading: boolean;
  onPractice: (key: CategoryKey | null) => void;
  onRegister: () => void;
  goTab: (tab: "dashboard" | "history" | "email" | "practice") => void;
}

export default function Dashboard({
  identity,
  stats,
  loading,
  onPractice,
  onRegister,
  goTab,
}: Props) {
  const xp = stats?.totals.xp ?? 0;
  const rounds = stats?.totals.rounds ?? 0;
  const acc = stats?.totals.accuracy ?? 0;
  const streak = stats?.totals.streak ?? 0;
  const lvl = levelFor(xp);
  const registered = !!identity.email;

  const xpAnim = useCountUp(xp, 900);
  const roundsAnim = useCountUp(rounds, 900);
  const accAnim = useCountUp(acc, 900);
  const streakAnim = useCountUp(streak, 900);

  const played = stats?.byCategory.filter((c) => c.rounds > 0).length ?? 0;

  const journey = [
    {
      icon: "email",
      label: "Link your email",
      sub: registered ? `Linked · alerts on` : "Get a score email after every round",
      done: registered,
      progress: registered ? 1 : 0,
    },
    {
      icon: "target",
      label: "Finish your first round",
      sub: rounds > 0 ? `${rounds} round${rounds === 1 ? "" : "s"} so far` : "Pick any section to start",
      done: rounds >= 1,
      progress: Math.min(1, rounds / 1),
    },
    {
      icon: "grid",
      label: "Try all five sections",
      sub: `${played} of 5 attempted`,
      done: played >= 5,
      progress: played / 5,
    },
    {
      icon: "star",
      label: "Hold a 70%+ average",
      sub: rounds > 0 ? `Currently ${acc}% average` : "Answer at least one round first",
      done: rounds > 0 && acc >= 70,
      progress: Math.min(1, acc / 70),
    },
    {
      icon: "trophy",
      label: "Reach 500 XP",
      sub: `${xp} / 500 XP earned`,
      done: xp >= 500,
      progress: Math.min(1, xp / 500),
    },
  ];
  const doneCount = journey.filter((j) => j.done).length;

  function quickRound() {
    const s = SECTIONS[Math.floor(Math.random() * SECTIONS.length)];
    onPractice(s.key);
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <FadeIn>
        <div className="relative overflow-hidden rounded-2xl border border-line bg-panel p-6 sm:p-7">
          <div
            className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full opacity-70 blur-3xl"
            style={{ background: "rgba(52,211,153,0.14)" }}
          />
          <div className="relative flex flex-wrap items-center gap-5">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-mint">
                InterviewArena
              </p>
              <h1 className="mt-1 font-display text-xl font-bold leading-snug sm:text-2xl">
                Ready for your next interview, {identity.name.split(" ")[0]}?
              </h1>
              <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-mute">
                Grammar · Verbal · Logical · Reading · Listening. Every round pulls fresh
                questions from the bank — finish one and take another.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-bold text-gold">
                  <Icon name="zap" size={13} /> Level {lvl.level} · {lvl.name}
                </span>
                <div className="hidden w-44 sm:block">
                  <Bar value={lvl.progress * 100} color="#f5b64a" height={5} />
                </div>
                <span className="hidden text-[11px] tabular-nums text-mute sm:block">
                  {lvl.next ? `${xp} / ${lvl.next} XP` : `${xp} XP max level`}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={quickRound}
                className="flex items-center gap-2 rounded-xl bg-mint px-5 py-3 font-display text-sm font-bold text-ink"
              >
                <Icon name="zap" size={16} /> Quick round — random section
              </motion.button>
              {!registered ? (
                <button
                  onClick={onRegister}
                  className="flex items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-5 py-2.5 text-sm font-semibold text-gold transition-colors hover:bg-gold/15"
                >
                  <Icon name="email" size={15} /> Link email for score email
                </button>
              ) : (
                <span className="flex items-center justify-center gap-2 rounded-xl border border-mint/30 bg-mint/5 px-5 py-2.5 text-xs font-semibold text-mint">
                  <Icon name="check" size={14} /> Email linked · alerts on
                </span>
              )}
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { icon: "trophy", label: "Total XP", value: xpAnim, suffix: "", color: "#f5b64a" },
          { icon: "target", label: "Rounds played", value: roundsAnim, suffix: "", color: "#34d399" },
          { icon: "star", label: "Avg accuracy", value: accAnim, suffix: "%", color: "#5cc8f5" },
          { icon: "flame", label: "Current streak", value: streakAnim, suffix: " rounds", color: "#fb7185" },
        ].map((t, i) => (
          <FadeIn key={t.label} delay={0.05 * i}>
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-4">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: `${t.color}1c`, color: t.color }}
              >
                <Icon name={t.icon} size={19} />
              </span>
              <div>
                <p className="font-display text-xl font-bold tabular-nums leading-none">
                  {t.value}
                  <span className="text-xs font-semibold text-mute">{t.suffix}</span>
                </p>
                <p className="mt-1 text-[11px] text-mute">{t.label}</p>
              </div>
            </div>
          </FadeIn>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Process tracker */}
        <FadeIn className="lg:col-span-2">
          <div className="h-full rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">Prep journey</h3>
              <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold tabular-nums text-mute">
                {doneCount}/5
              </span>
            </div>
            <div className="mt-2">
              <Bar value={(doneCount / 5) * 100} color="#34d399" height={5} />
            </div>
            <ul className="mt-4 space-y-1">
              {journey.map((j, i) => (
                <motion.li
                  key={j.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 * i }}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-panel2"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      j.done ? "bg-mint/15 text-mint" : "bg-cream/5 text-mute"
                    }`}
                  >
                    {j.done ? (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2 + 0.08 * i, type: "spring", stiffness: 300, damping: 18 }}
                      >
                        <Icon name="check" size={16} strokeWidth={2.6} />
                      </motion.span>
                    ) : (
                      <Icon name={j.icon} size={16} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${j.done ? "text-cream" : "text-cream/80"}`}>
                      {j.label}
                    </p>
                    <p className="truncate text-[11px] text-mute">{j.sub}</p>
                  </div>
                  {!j.done ? (
                    <span className="ml-auto w-14 shrink-0">
                      <Bar value={j.progress * 100} color="#8ca49a" height={4} />
                    </span>
                  ) : null}
                </motion.li>
              ))}
            </ul>
          </div>
        </FadeIn>

        {/* Sections */}
        <FadeIn delay={0.08} className="lg:col-span-3">
          <div className="h-full rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">Practice sections</h3>
              <button
                onClick={() => goTab("practice")}
                className="flex items-center gap-1 text-xs font-semibold text-mint transition-colors hover:text-cream"
              >
                All sections <Icon name="chevron" size={13} />
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {SECTIONS.map((s) => {
                const st = stats?.byCategory.find((c) => c.category === s.key);
                return (
                  <li key={s.key}>
                    <button
                      onClick={() => onPractice(s.key)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-line hover:bg-panel2"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: s.soft, color: s.accent }}
                      >
                        <Icon name={s.icon} size={19} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm font-semibold">{s.label}</p>
                        <p className="truncate text-[11px] text-mute">
                          {st && st.rounds > 0
                            ? `${st.rounds} rounds · best ${st.bestScore} pts`
                            : "Not attempted yet"}
                        </p>
                      </div>
                      <div className="hidden w-28 sm:block">
                        <div className="mb-1 flex justify-between text-[10px] text-mute">
                          <span>avg</span>
                          <span className="font-bold tabular-nums" style={{ color: s.accent }}>
                            {st ? `${st.accuracy}%` : "—"}
                          </span>
                        </div>
                        <Bar value={st?.accuracy ?? 0} color={s.accent} height={4} />
                      </div>
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-mute transition-colors group-hover:border-line2 group-hover:text-cream"
                        style={{ transitionDelay: "0s" }}
                      >
                        <Icon name="chevron" size={14} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </FadeIn>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Badges */}
        <FadeIn delay={0.1} className="lg:col-span-2">
          <div className="h-full rounded-2xl border border-line bg-panel p-5">
            <h3 className="font-display text-sm font-semibold">Badges</h3>
            {loading ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skel key={i} className="h-16" />
                ))}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(stats?.badges ?? []).map((b, i) => (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.06 * i }}
                    className={`rounded-xl border p-3 ${
                      b.earned
                        ? "border-gold/30 bg-gold/10"
                        : "border-line bg-panel2 opacity-55"
                    }`}
                  >
                    <Icon
                      name="award"
                      size={18}
                      className={b.earned ? "text-gold" : "text-mute"}
                    />
                    <p className="mt-1.5 text-xs font-bold">{b.label}</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-mute">{b.desc}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </FadeIn>

        {/* Recent activity */}
        <FadeIn delay={0.14} className="lg:col-span-3">
          <div className="h-full rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">Recent rounds</h3>
              <button
                onClick={() => goTab("history")}
                className="flex items-center gap-1 text-xs font-semibold text-mint transition-colors hover:text-cream"
              >
                Full log <Icon name="chevron" size={13} />
              </button>
            </div>
            {loading ? (
              <div className="mt-4 space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skel key={i} className="h-12" />
                ))}
              </div>
            ) : !stats || stats.recent.length === 0 ? (
              <EmptyState
                icon="target"
                title="No rounds yet"
                sub="Your score history will appear here after your first round."
                action={
                  <button
                    onClick={quickRound}
                    className="mt-1 rounded-xl bg-mint px-4 py-2 font-display text-xs font-bold text-ink"
                  >
                    Start your first round
                  </button>
                }
              />
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {stats.recent.slice(0, 5).map((r) => {
                  const s = sectionByKey(r.category);
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-2.5">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-xl"
                        style={{ background: s.soft, color: s.accent }}
                      >
                        <Icon name={s.icon} size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{s.short}</p>
                        <p className="text-[11px] text-mute">{timeAgo(r.completedAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums">
                          {r.correct}/{r.total}
                          <span className="ml-1.5 text-xs font-semibold" style={{ color: s.accent }}>
                            {r.accuracy}%
                          </span>
                        </p>
                        <p className="text-[11px] text-mute">
                          {r.score} pts · {r.rating}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
