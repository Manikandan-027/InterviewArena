"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { EmailItem } from "@/lib/types";
import type { Identity } from "@/lib/identity";
import { EmptyState, FadeIn, Icon, Skel } from "./ui";

interface Props {
  identity: Identity;
  onRegister: () => void;
  onNotify: (kind: "success" | "error" | "info", text: string) => void;
}

const EVENT_STYLE: Record<string, { icon: string; color: string }> = {
  welcome: { icon: "sparkles", color: "#f5b64a" },
  round_complete: { icon: "trophy", color: "#34d399" },
  test: { icon: "email", color: "#5cc8f5" },
};

export default function EmailCenter({ identity, onRegister, onNotify }: Props) {
  const registered = !!identity.email;
  const [items, setItems] = React.useState<EmailItem[] | null>(null);
  const [sending, setSending] = React.useState(false);

  async function load() {
    if (!registered) return;
    try {
      const res = await api.notifications(identity.email);
      setItems(res.items);
    } catch {
      setItems([]);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.email]);

  async function sendTest() {
    if (!registered) return;
    setSending(true);
    try {
      await api.sendTestEmail(identity.email);
      onNotify("success", "Test Email sent to your email");
      await load();
    } catch (e) {
      onNotify("error", e instanceof Error ? e.message : "Could not send test Email");
    } finally {
      setSending(false);
    }
  }

  if (!registered) {
    return (
      <div className="mx-auto max-w-xl">
        <FadeIn>
          <div className="rounded-2xl border border-line bg-panel p-7 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 16 }}
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/10 text-gold"
            >
              <Icon name="email" size={26} />
            </motion.div>
            <h2 className="mt-4 font-display text-lg font-bold">
              Get score alerts in your inbox
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-mute">
              Link your email once — after every practice round we send your score, accuracy and rating directly to your inbox.
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onRegister}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3 font-display text-sm font-bold text-ink"
            >
              <Icon name="send" size={15} /> Register email address
            </motion.button>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { n: "1", t: "Register", d: "Add your name and email address." },
              { n: "2", t: "Play rounds", d: "Any section — fresh questions every time." },
              { n: "3", t: "Get the email", d: "Score, accuracy and rating, instantly." },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-line bg-panel p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cream/5 font-display text-xs font-bold text-mint">
                  {s.n}
                </span>
                <p className="mt-2 font-display text-sm font-semibold">{s.t}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-mute">{s.d}</p>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <FadeIn>
        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint/10 text-mint">
              <Icon name="email" size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold">Email linked</p>
              <p className="font-display text-lg font-bold tracking-wide tabular-nums">
                {identity.email}
              </p>
              <p className="text-[11px] text-mute">
                {identity.name} · {items?.length ?? "…"} emails in inbox
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              disabled={sending}
              onClick={() => void sendTest()}
              className="flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 font-display text-xs font-bold text-ink disabled:opacity-60"
            >
              <Icon name={sending ? "refresh" : "send"} size={14} className={sending ? "animate-spin" : ""} />
              {sending ? "Sending…" : "Send test email"}
            </motion.button>
          </div>
          <div className="mt-4 rounded-xl border border-line bg-panel2 p-3 text-[11px] leading-relaxed text-mute">
            <span className="font-semibold text-gold">SMTP email:</span> real emails are sent through the configured SMTP account and successful sends are logged in the <span className="text-cream">notifications</span> table.
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.08}>
        <div className="mt-4 rounded-2xl border border-line bg-panel p-5">
          <h3 className="font-display text-sm font-semibold">Inbox</h3>
          {items === null ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skel key={i} className="h-20" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon="email"
              title="No emails yet"
              sub="Finish a round and your first score email will land here."
            />
          ) : (
            <ul className="mt-3 space-y-2.5">
              {items.map((it, i) => {
                const st = EVENT_STYLE[it.event] ?? EVENT_STYLE.test;
                return (
                  <motion.li
                    key={it.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 * i }}
                    className="flex gap-3 rounded-xl border border-line bg-panel2 p-4"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${st.color}1c`, color: st.color }}
                    >
                      <Icon name={st.icon} size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-bold">{it.title}</p>
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-mint/10 px-2 py-0.5 text-[10px] font-bold text-mint">
                          <Icon name="check" size={10} strokeWidth={3} /> {it.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-mute">{it.body}</p>
                      <p className="mt-1.5 text-[10px] text-mute/70">{timeAgo(it.createdAt)}</p>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
