"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { loadIdentity, type Identity } from "@/lib/identity";
import { levelFor } from "@/lib/format";
import type { CategoryKey, NotebookItem, Stats } from "@/lib/types";
import Dashboard from "@/components/Dashboard";
import Practice from "@/components/Practice";
import History from "@/components/History";
import EmailCenter from "@/components/EmailCenter";
import RegisterModal from "@/components/RegisterModal";
import { AnimatePresence as AP, Icon, ToastView } from "@/components/ui";

type Tab = "dashboard" | "practice" | "history" | "email";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "grid" },
  { key: "practice", label: "Practice", icon: "target" },
  { key: "history", label: "History", icon: "history" },
  { key: "email", label: "Email Center", icon: "email" },
];

interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

export default function Page() {
  const [tab, setTab] = React.useState<Tab>("dashboard");
  const [identity, setIdentity] = React.useState<Identity | null>(null);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [missed, setMissed] = React.useState<NotebookItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [startSection, setStartSection] = React.useState<CategoryKey | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const toastId = React.useRef(0);

  const notify = React.useCallback(
    (kind: Toast["kind"], text: string) => {
      const id = ++toastId.current;
      setToasts((t) => [...t.slice(-3), { id, kind, text }]);
      window.setTimeout(
        () => setToasts((t) => t.filter((x) => x.id !== id)),
        4200,
      );
    },
    [],
  );

  const refresh = React.useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([api.stats(userId), api.review(userId)]);
      setStats(s);
      setMissed(m.missed);
    } catch {
      setStats(null);
      setMissed([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const idn = loadIdentity();
    setIdentity(idn);
    void refresh(idn.id);
  }, [refresh]);

  const goTab = React.useCallback(
    (t: Tab) => {
      setTab(t);
      if (t !== "practice" && identity) void refresh(identity.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [identity, refresh],
  );

  const practiceSection = React.useCallback((key: CategoryKey | null) => {
    if (!key) return;
    setStartSection(key);
    setTab("practice");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleRoundComplete = React.useCallback(
    (info: { category: CategoryKey; accuracy: number; emailSent: boolean }) => {
      if (!identity) return;
      void refresh(identity.id);
      if (info.emailSent) {
        notify("success", "Score email sent to your email address");
      } else if (!identity.email) {
        notify("info", "Round saved — link your email to get score email alerts");
      } else {
        notify("success", `Round saved — ${info.accuracy}% accuracy`);
      }
    },
    [identity, notify, refresh],
  );

  const handleRegistered = React.useCallback(
    (next: Identity) => {
      setIdentity(next);
      void refresh(next.id);
      setModalOpen(false);
      notify("success", "Email linked — welcome email is on its way");
    },
    [notify, refresh],
  );

  if (!identity) {
    return (
      <div className="bg-arena flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-mute">
          <span className="flex h-10 w-10 animate-pulse items-center justify-center rounded-xl bg-mint/10 text-mint">
            <Icon name="logo" size={22} />
          </span>
          <span className="font-display text-sm">Loading InterviewArena…</span>
        </div>
      </div>
    );
  }

  const lvl = levelFor(stats?.totals.xp ?? 0);

  return (
    <div className="bg-arena min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <button
            onClick={() => goTab("dashboard")}
            className="flex items-center gap-2.5"
            title="InterviewArena home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint text-ink">
              <Icon name="logo" size={21} strokeWidth={2} />
            </span>
            <span className="hidden font-display text-sm font-bold sm:block">
              Interview<span className="text-mint">Arena</span>
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => goTab(t.key)}
                className={`relative rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                  tab === t.key ? "text-cream" : "text-mute hover:text-cream"
                }`}
              >
                {tab === t.key ? (
                  <motion.span
                    layoutId="tabpill"
                    className="absolute inset-0 rounded-lg border border-line bg-panel2"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                ) : null}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon name={t.icon} size={14} />
                  {t.label}
                </span>
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-panel2 px-3 py-1.5 text-[11px] font-bold text-gold sm:flex">
              <Icon name="zap" size={12} /> Lv {lvl.level} · {lvl.name}
            </span>
            {identity.email ? (
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 rounded-full border border-mint/30 bg-mint/5 py-1 pl-1 pr-3 transition-colors hover:bg-mint/10"
                title="Edit email details"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-mint font-display text-[11px] font-bold text-ink">
                  {identity.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden text-xs font-semibold sm:block">
                  {identity.name.split(" ")[0]}
                </span>
              </button>
            ) : (
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-2 text-xs font-bold text-gold transition-colors hover:bg-gold/15"
              >
                <Icon name="email" size={13} /> Link email
              </button>
            )}
          </div>
        </div>

        {/* Email nav */}
        <nav className="flex items-center gap-1 overflow-x-auto px-3 pb-2 md:hidden">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => goTab(t.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                tab === t.key
                  ? "border border-line bg-panel2 text-cream"
                  : "text-mute hover:text-cream"
              }`}
            >
              <Icon name={t.icon} size={13} />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <AP mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {tab === "dashboard" ? (
              <Dashboard
                identity={identity}
                stats={stats}
                loading={loading}
                onPractice={practiceSection}
                onRegister={() => setModalOpen(true)}
                goTab={goTab}
              />
            ) : null}
            {tab === "practice" ? (
              <Practice
                identity={identity}
                stats={stats}
                startSection={startSection}
                onStarted={() => setStartSection(null)}
                onRoundComplete={handleRoundComplete}
                onNotify={notify}
                goTab={goTab}
              />
            ) : null}
            {tab === "history" ? (
              <History
                stats={stats}
                loading={loading}
                missed={missed}
                onPractice={practiceSection}
              />
            ) : null}
            {tab === "email" ? (
              <EmailCenter
                identity={identity}
                onRegister={() => setModalOpen(true)}
                onNotify={notify}
              />
            ) : null}
          </motion.div>
        </AP>
      </main>

      <footer className="border-t border-line py-6">
        <p className="mx-auto max-w-6xl px-4 text-center text-[11px] text-mute/70">
          Questions, answers and scores are stored in PostgreSQL · Fresh rounds never repeat
          recent questions · SMTP email notifications are enabled
        </p>
      </footer>

      {/* Register modal */}
      <RegisterModal
        open={modalOpen}
        current={identity}
        onClose={() => setModalOpen(false)}
        onRegistered={handleRegistered}
      />

      {/* Toasts */}
      <AP>
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
          {toasts.map((t) => (
            <ToastView key={t.id} toast={t} />
          ))}
        </div>
      </AP>
    </div>
  );
}
