"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ---------------------------------- Icons --------------------------------- */

const ICONS: Record<string, React.ReactNode> = {
  logo: (
    <>
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" />
      <path d="m10.5 7.5-3 5h3.6l-1 4 4.4-5.6h-3.6z" fill="currentColor" stroke="none" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4v5h5" />
      <path d="M12 8v4.5l3 1.8" />
    </>
  ),
  message: (
    <>
      <path d="M21 14.5a2 2 0 0 1-2 2H8l-5 4.5v-15a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 8.5h8M8 12h5" />
    </>
  ),
  email: (
  <>
    <rect
      x="3"
      y="5"
      width="18"
      height="14"
      rx="2"
    />
    <path d="m4 7 8 6 8-6" />
  </>
),
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v4.5l3 1.8" />
    </>
  ),
  flame: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  trophy: (
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M6 2h12v7a6 6 0 0 1-12 0z" />
      <path d="M12 15v3" />
      <path d="M8 21h8" />
      <path d="M10 18h4" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </>
  ),
  play: <path d="m8 5.5 11 6.5-11 6.5z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  replay: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4v5h5" />
    </>
  ),
  pen: <path d="M17 3.5a2.6 2.6 0 1 1 3.7 3.7L7.5 20.4 2.5 21.5l1.1-5z" />,
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M9 7h7" />
    </>
  ),
  shapes: (
    <>
      <circle cx="7" cy="7" r="3.5" />
      <path d="m17 3.5 4 7h-8z" />
      <rect x="4.5" y="14.5" width="7" height="7" rx="1" />
      <path d="m17.5 14.5 3.5 6.5h-7z" />
    </>
  ),
  doc: (
    <>
      <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-11z" />
      <path d="M14 2.5v6h6" />
      <path d="M9 13.5h6M9 17h6" />
    </>
  ),
  ear: (
    <>
      <path d="M6.5 8.5a5.5 5.5 0 1 1 11 0c0 5-5.5 5.5-5.5 9a3.2 3.2 0 1 1-6.4 0" />
      <path d="M14 8.5a2.5 2.5 0 0 0-5 0v.5a2 2 0 1 0 4 0" />
    </>
  ),
  zap: <path d="M13 2 3.5 13.5h6.5L9 22l10.5-11.5H13z" />,
  star: (
    <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5" />
      <path d="M12 16h.01" />
    </>
  ),
  chevron: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="m11.5 18.5-6.5-6.5 6.5-6.5" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="m9.2 13.7-1.4 7.3 4.2-2.6 4.2 2.6-1.4-7.3" />
    </>
  ),
  volume: (
    <>
      <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
      <path d="M15 9a4.5 4.5 0 0 1 0 6" />
      <path d="M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-11 11" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21c1.4-3.8 4.6-5.5 7.5-5.5s6.1 1.7 7.5 5.5" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.8 4.9L18.5 9.5l-4.7 1.6L12 16l-1.8-4.9L5.5 9.5l4.7-1.6z" />
      <path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 1.8,
}: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {ICONS[name] ?? null}
    </svg>
  );
}

/* ------------------------------- Progress ring ------------------------------ */

export function ProgressRing({
  size = 56,
  stroke = 5,
  value,
  color,
  track = "rgba(232,240,234,0.09)",
  children,
}: {
  size?: number;
  stroke?: number;
  value: number;
  color: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ width: size, height: size }} className="relative shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={{ type: "spring", stiffness: 60, damping: 16 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/* ----------------------------------- Bar ----------------------------------- */

export function Bar({
  value,
  color,
  className,
  height = 6,
}: {
  value: number;
  color: string;
  className?: string;
  height?: number;
}) {
  return (
    <div
      className={className}
      style={{ height, borderRadius: 99, background: "rgba(232,240,234,0.08)" }}
    >
      <motion.div
        className="h-full"
        style={{ background: color, borderRadius: 99 }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ type: "spring", stiffness: 70, damping: 18, delay: 0.15 }}
      />
    </div>
  );
}

/* -------------------------------- Confetti --------------------------------- */

export function Confetti({ colors }: { colors: string[] }) {
  const pieces = React.useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        dx: (Math.random() - 0.5) * 520,
        rot: Math.random() * 720 - 360,
        delay: Math.random() * 0.25,
        dur: 1.5 + Math.random() * 0.9,
        color: colors[i % colors.length],
        w: 6 + Math.random() * 6,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-4 z-10 h-72 overflow-hidden">
      {pieces.map((p, i) => (
        <motion.div
          key={i}
          className="absolute left-1/2 top-0"
          initial={{ y: -16, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: 300, x: p.dx, rotate: p.rot, opacity: 0 }}
          transition={{ duration: p.dur, delay: p.delay, ease: "easeIn" }}
          style={{ width: p.w, height: p.w * 0.45, background: p.color, borderRadius: 2 }}
        />
      ))}
    </div>
  );
}

/* -------------------------------- Count up --------------------------------- */

export function useCountUp(target: number, durationMs = 900): number {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

/* --------------------------------- Skeleton -------------------------------- */

export function Skel({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ""}`} />;
}

/* ------------------------------ Error / Empty ------------------------------ */

export function EmptyState({
  icon,
  title,
  sub,
  action,
}: {
  icon: string;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-panel2 text-mute"
      >
        <Icon name={icon} size={22} />
      </motion.div>
      <p className="font-display text-sm font-semibold text-cream">{title}</p>
      {sub ? <p className="max-w-xs text-xs leading-relaxed text-mute">{sub}</p> : null}
      {action}
    </div>
  );
}

/* ------------------------------- Toast item ------------------------------- */

export function ToastView({
  toast,
}: {
  toast: { id: number; kind: "success" | "error" | "info"; text: string };
}) {
  const palette =
    toast.kind === "success"
      ? { border: "border-mint/40", text: "text-mint", icon: "check" }
      : toast.kind === "error"
        ? { border: "border-rose/40", text: "text-rose", icon: "alert" }
        : { border: "border-gold/40", text: "text-gold", icon: "sparkles" };
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      className={`flex items-center gap-2.5 rounded-xl border ${palette.border} bg-panel2/95 px-4 py-3 shadow-xl shadow-black/40 backdrop-blur`}
    >
      <span className={palette.text}>
        <Icon name={palette.icon} size={16} />
      </span>
      <p className="text-xs font-medium text-cream">{toast.text}</p>
    </motion.div>
  );
}

/* ------------------------------ Animate fade ------------------------------ */

export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export { AnimatePresence };
