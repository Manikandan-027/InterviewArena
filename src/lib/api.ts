import type {
  NotebookItem,
  RoundResponse,
  EmailItem,
  Stats,
  SubmitResponse,
} from "./types";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export interface SubmitPayload {
  userId: string;
  category: string;
  durationMs: number;
  email: string;
  results: { questionId: number; answer: number; timeTakenMs: number }[];
}

export const api = {
  fetchRound: (category: string) =>
    http<RoundResponse>(`/api/questions?category=${encodeURIComponent(category)}`),

  submitRound: (p: SubmitPayload) =>
    http<SubmitResponse>("/api/submit", {
      method: "POST",
      body: JSON.stringify(p),
    }),

  register: (name: string, email: string) =>
    http<{ ok: boolean; email: string; name: string }>("/api/register", {
      method: "POST",
      body: JSON.stringify({ name, email }),
    }),

  stats: (userId: string) =>
    http<Stats>(`/api/stats?userId=${encodeURIComponent(userId)}`),

  review: (userId: string) =>
    http<{ missed: NotebookItem[] }>(`/api/review?userId=${encodeURIComponent(userId)}`),

  notifications: (email: string) =>
    http<{ items: EmailItem[] }>(`/api/notifications?email=${encodeURIComponent(email)}`),

  sendTestEmail: (email: string) =>
  http<{
    ok: boolean;
    message?: string;
  }>("/api/notifications/send", {
    method: "POST",
    body: JSON.stringify({
      email,
    }),
  }),
};
