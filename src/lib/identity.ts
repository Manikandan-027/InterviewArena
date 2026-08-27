export interface Identity {
  /** Stable id used for attempts. Registered users use their email address. */
  id: string;
  name: string;
  email: string;
}

const KEY = "ia_identity_email_v1";

function anonId(): string {
  return `anon-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function cleanEmail(v: string): string {
  return (v || "").trim().toLowerCase();
}

export function isRegisteredEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(v));
}

export function loadIdentity(): Identity {
  if (typeof window === "undefined") return { id: anonId(), name: "Candidate", email: "" };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Identity>;
      if (parsed && typeof parsed.id === "string") {
        return { id: parsed.id, name: parsed.name || "Candidate", email: cleanEmail(parsed.email || "") };
      }
    }
  } catch {
    /* fall through */
  }
  const fresh: Identity = { id: anonId(), name: "Candidate", email: "" };
  try { window.localStorage.setItem(KEY, JSON.stringify(fresh)); } catch { /* storage unavailable */ }
  return fresh;
}

export function saveIdentity(identity: Identity): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(identity)); } catch { /* storage unavailable */ }
}

export function toRegistered(_prev: Identity, name: string, email: string): Identity {
  const normalized = cleanEmail(email);
  const next: Identity = { id: normalized, name, email: normalized };
  saveIdentity(next);
  return next;
}
