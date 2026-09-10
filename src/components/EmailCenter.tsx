"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";

import type { EmailItem } from "@/lib/types";
import type { Identity } from "@/lib/identity";

import {
  EmptyState,
  FadeIn,
  Icon,
  Skel,
} from "./ui";

interface Props {
  identity: Identity;

  onRegister: () => void;

  onNotify: (
    kind:
      | "success"
      | "error"
      | "info",
    text: string,
  ) => void;
}

const EVENT_STYLE: Record<
  string,
  {
    icon: string;
    color: string;
  }
> = {
  welcome: {
    icon: "sparkles",
    color: "#f5b64a",
  },

  round_complete: {
    icon: "trophy",
    color: "#34d399",
  },

  test: {
    icon: "email",
    color: "#5cc8f5",
  },
};

export default function EmailCenter({
  identity,
  onRegister,
  onNotify,
}: Props) {
  const authenticated =
    identity.authenticated;

  const [
    items,
    setItems,
  ] =
    React.useState<
      EmailItem[] | null
    >(null);

  const [
    sending,
    setSending,
  ] =
    React.useState(false);

  async function load() {
    if (!authenticated) {
      setItems([]);

      return;
    }

    try {
      const result =
        await api.notifications();

      setItems(
        result.items,
      );
    } catch {
      setItems([]);
    }
  }

  React.useEffect(() => {
    void load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    identity.email,
  ]);

  async function sendTest() {
    if (!authenticated) {
      onRegister();

      return;
    }

    setSending(true);

    try {
      await api.sendTestEmail();

      onNotify(
        "success",
        "Test email sent successfully.",
      );

      await load();
    } catch (error) {
      onNotify(
        "error",
        error instanceof Error
          ? error.message
          : "Could not send test email.",
      );
    } finally {
      setSending(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-xl">
        <FadeIn>
          <div className="rounded-2xl border border-line bg-panel p-7 text-center">
            <motion.div
              initial={{
                scale: 0.8,
                opacity: 0,
              }}
              animate={{
                scale: 1,
                opacity: 1,
              }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 16,
              }}
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/10 text-gold"
            >
              <Icon
                name="email"
                size={26}
              />
            </motion.div>

            <h2 className="mt-4 font-display text-lg font-bold">
              Login to get score alerts
            </h2>

            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-mute">
              Login to your account or register a new account. After every practice round, your score, accuracy and rating will be sent to your email.
            </p>

            <motion.button
              whileHover={{
                scale: 1.03,
              }}
              whileTap={{
                scale: 0.97,
              }}
              onClick={
                onRegister
              }
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3 font-display text-sm font-bold text-ink"
            >
              <Icon
                name="log-in"
                size={15}
              />

              Login / Register
            </motion.button>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                n: "1",
                t: "Login",
                d: "Existing users sign in with email and password.",
              },

              {
                n: "2",
                t: "Practice",
                d: "Complete any InterviewArena section.",
              },

              {
                n: "3",
                t: "Get the email",
                d: "Your score, accuracy and rating arrive in your inbox.",
              },
            ].map(
              (item) => (
                <div
                  key={
                    item.n
                  }
                  className="rounded-2xl border border-line bg-panel p-4"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cream/5 font-display text-xs font-bold text-mint">
                    {
                      item.n
                    }
                  </span>

                  <p className="mt-2 font-display text-sm font-semibold">
                    {
                      item.t
                    }
                  </p>

                  <p className="mt-1 text-[11px] leading-relaxed text-mute">
                    {
                      item.d
                    }
                  </p>
                </div>
              ),
            )}
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
              <Icon
                name="email"
                size={22}
              />
            </span>

            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold">
                Email connected
              </p>

              <p className="font-display text-lg font-bold tracking-wide tabular-nums">
                {
                  identity.email
                }
              </p>

              <p className="text-[11px] text-mute">
                {
                  identity.name
                }{" "}
                ·{" "}
                {items?.length ??
                  "…"}{" "}
                emails
              </p>
            </div>

            <motion.button
              whileHover={{
                scale: 1.03,
              }}
              whileTap={{
                scale: 0.97,
              }}
              disabled={
                sending
              }
              onClick={() =>
                void sendTest()
              }
              className="flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 font-display text-xs font-bold text-ink disabled:opacity-60"
            >
              <Icon
                name={
                  sending
                    ? "refresh"
                    : "send"
                }
                size={14}
                className={
                  sending
                    ? "animate-spin"
                    : ""
                }
              />

              {sending
                ? "Sending…"
                : "Send test email"}
            </motion.button>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-panel2 p-3 text-[11px] leading-relaxed text-mute">
            <span className="font-semibold text-gold">
              SMTP email:
            </span>{" "}
            emails are sent through your configured SMTP account. Successful sends are recorded in the notifications table.
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.08}>
        <div className="mt-4 rounded-2xl border border-line bg-panel p-5">
          <h3 className="font-display text-sm font-semibold">
            Inbox
          </h3>

          {items ===
          null ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map(
                (index) => (
                  <Skel
                    key={
                      index
                    }
                    className="h-20"
                  />
                ),
              )}
            </div>
          ) : items.length ===
            0 ? (
            <EmptyState
              icon="email"
              title="No emails yet"
              sub="Finish a round and your first score email will appear here."
            />
          ) : (
            <ul className="mt-3 space-y-2.5">
              {items.map(
                (
                  item,
                  index,
                ) => {
                  const style =
                    EVENT_STYLE[
                      item.event
                    ] ??
                    EVENT_STYLE.test;

                  return (
                    <motion.li
                      key={
                        item.id
                      }
                      initial={{
                        opacity: 0,
                        y: 8,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{
                        delay:
                          0.04 *
                          index,
                      }}
                      className="flex gap-3 rounded-xl border border-line bg-panel2 p-4"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background:
                            `${style.color}1c`,
                          color:
                            style.color,
                        }}
                      >
                        <Icon
                          name={
                            style.icon
                          }
                          size={17}
                        />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-bold">
                            {
                              item.title
                            }
                          </p>

                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-mint/10 px-2 py-0.5 text-[10px] font-bold text-mint">
                            <Icon
                              name="check"
                              size={10}
                              strokeWidth={
                                3
                              }
                            />

                            {
                              item.status
                            }
                          </span>
                        </div>

                        <p className="mt-1 text-xs leading-relaxed text-mute">
                          {
                            item.body
                          }
                        </p>

                        <p className="mt-1.5 text-[10px] text-mute/70">
                          {timeAgo(
                            item.createdAt,
                          )}
                        </p>
                      </div>
                    </motion.li>
                  );
                },
              )}
            </ul>
          )}
        </div>
      </FadeIn>
    </div>
  );
}