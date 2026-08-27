"use client";

import { sectionByKey } from "@/lib/sections";
import { timeAgo } from "@/lib/format";
import type { CategoryKey, NotebookItem, Stats } from "@/lib/types";
import { Bar, EmptyState, FadeIn, Icon } from "./ui";

interface Props {
  stats: Stats | null;
  loading: boolean;
  missed: NotebookItem[];
  onPractice: (key: CategoryKey) => void;
}

export default function History({ stats, loading, missed, onPractice }: Props) {
  const hasAttempts = !!stats && stats.recent.length > 0;

  return (
    <div className="space-y-5">
      <FadeIn>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky2/10 text-sky2">
            <Icon name="history" size={17} />
          </span>
          <div>
            <p className="font-display text-sm font-semibold">Attempt log & Missed notebook</p>
            <p className="text-xs text-mute">
              Every question you answered is stored in the backend — review what slipped.
            </p>
          </div>
        </div>
      </FadeIn>

      <div className="grid gap-5 lg:grid-cols-5">
        <FadeIn delay={0.05} className="lg:col-span-3">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <h3 className="font-display text-sm font-semibold">
              Attempts
              {stats && stats.recent.length > 0 ? (
                <span className="ml-2 text-xs font-normal text-mute">
                  {stats.totals.rounds} total
                </span>
              ) : null}
            </h3>
            {loading ? (
              <div className="mt-4 space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton h-12" />
                ))}
              </div>
            ) : !hasAttempts ? (
              <EmptyState
                icon="history"
                title="Nothing here yet"
                sub="Play a round in Practice and it will land in this log automatically."
              />
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {stats.recent.map((r) => {
                  const s = sectionByKey(r.category);
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: s.soft, color: s.accent }}
                      >
                        <Icon name={s.icon} size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{s.label}</p>
                        <p className="text-[11px] text-mute">{timeAgo(r.completedAt)}</p>
                      </div>
                      <div className="w-24">
                        <div className="mb-1 flex justify-between text-[10px] text-mute">
                          <span>
                            {r.correct}/{r.total}
                          </span>
                          <span className="font-bold tabular-nums" style={{ color: s.accent }}>
                            {r.accuracy}%
                          </span>
                        </div>
                        <Bar value={r.accuracy} color={s.accent} height={4} />
                      </div>
                      <div className="w-16 text-right">
                        <p className="text-sm font-bold tabular-nums">{r.score}</p>
                        <p className="text-[10px] text-mute">pts</p>
                      </div>
                      <span
                        className="hidden w-24 rounded-full px-2 py-1 text-center text-[10px] font-bold sm:block"
                        style={{ background: `${s.accent}1c`, color: s.accent }}
                      >
                        {r.rating}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </FadeIn>

        <FadeIn delay={0.1} className="lg:col-span-2">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
              <Icon name="alert" size={15} className="text-rose" />
              Missed notebook
            </h3>
            {loading ? (
              <div className="mt-4 space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-20" />
                ))}
              </div>
            ) : missed.length === 0 ? (
              <EmptyState
                icon="check"
                title="Nothing missed"
                sub="Wrong answers are captured here with the correct one, so you can re-drill the section."
              />
            ) : (
              <ul className="mt-3 space-y-2.5">
                {missed.slice(0, 6).map((m) => {
                  const s = sectionByKey(m.category);
                  return (
                    <li key={m.id} className="rounded-xl border border-line bg-panel2 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: s.soft, color: s.accent }}
                        >
                          {s.short}
                        </span>
                        <span className="text-[10px] text-mute">{timeAgo(m.createdAt)}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs font-medium leading-relaxed">
                        {m.question}
                      </p>
                      <div className="mt-2 space-y-1 text-[11px]">
                        <p className="text-rose">
                          You:{" "}
                          {m.userAnswer >= 0 ? m.options[m.userAnswer] : "Skipped"}
                        </p>
                        <p className="text-mint">
                          Correct: {m.options[m.correctIndex]}
                        </p>
                      </div>
                      <button
                        onClick={() => onPractice(m.category as CategoryKey)}
                        className="mt-2.5 flex items-center gap-1 text-[11px] font-bold transition-transform hover:translate-x-0.5"
                        style={{ color: s.accent }}
                      >
                        Drill {s.short} again <Icon name="chevron" size={12} />
                      </button>
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
