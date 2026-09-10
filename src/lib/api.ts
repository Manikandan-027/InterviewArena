import type {
  NotebookItem,
  RoundResponse,
  EmailItem,
  Stats,
  SubmitResponse,
} from "./types";

async function http<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response =
    await fetch(
      path,
      {
        ...init,

        credentials:
          "include",

        headers: {
          "Content-Type":
            "application/json",

          ...(init?.headers || {}),
        },

        cache:
          init?.cache ??
          "no-store",
      },
    );

  if (!response.ok) {
    let message =
      `Request failed (${response.status})`;

    try {
      const json =
        (await response.json()) as {
          error?: string;
        };

      if (json?.error) {
        message =
          json.error;
      }
    } catch {
      // Keep default.
    }

    throw new Error(
      message,
    );
  }

  return (await response.json()) as T;
}

export interface SubmitPayload {
  /*
   * These fields are kept optional for compatibility
   * with the existing Practice component.
   *
   * THE SERVER DOES NOT TRUST THEM.
   */
  userId?: string;

  email?: string;

  category: string;

  durationMs: number;

  results: {
    questionId: number;
    answer: number;
    timeTakenMs: number;
  }[];
}

export const api = {
  /* =======================================================
     QUESTIONS
     ======================================================= */

  fetchRound: (
    category: string,
  ) =>
    http<RoundResponse>(
      `/api/questions?category=${encodeURIComponent(
        category,
      )}`,
    ),

  /* =======================================================
     SUBMIT
     ======================================================= */

  submitRound: (
    payload: SubmitPayload,
  ) =>
    http<SubmitResponse>(
      "/api/submit",
      {
        method: "POST",

        body:
          JSON.stringify(
            payload,
          ),
      },
    ),

  /* =======================================================
     AUTHENTICATION
     ======================================================= */

  session:
    () =>
      http<{
        authenticated: boolean;
        id: string;
        name: string;
        email: string;
      }>(
        "/api/auth/session",
      ),

  captcha:
    () =>
      http<{
        token: string;
        question: string;
      }>(
        "/api/auth/captcha",
      ),

  login:
    (
      email: string,
      password: string,
      captchaToken: string,
      captchaAnswer: string,
    ) =>
      http<{
        ok: boolean;
        authenticated: boolean;
        id: string;
        name: string;
        email: string;
        message: string;
      }>(
        "/api/auth/login",
        {
          method: "POST",

          body:
            JSON.stringify({
              email,
              password,
              captchaToken,
              captchaAnswer,
            }),
        },
      ),

  register:
    (
      name: string,
      email: string,
      password: string,
      captchaToken: string,
      captchaAnswer: string,
    ) =>
      http<{
        ok: boolean;
        registered: boolean;
        authenticated: boolean;
        id: string;
        name: string;
        email: string;
        message: string;
      }>(
        "/api/register",
        {
          method: "POST",

          body:
            JSON.stringify({
              name,
              email,
              password,
              captchaToken,
              captchaAnswer,
            }),
        },
      ),

  logout:
    () =>
      http<{
        ok: boolean;
        authenticated: boolean;
      }>(
        "/api/auth/logout",
        {
          method: "POST",
        },
      ),

  /* =======================================================
     STATS
     ======================================================= */

  /*
   * userId is accepted for compatibility with
   * your current page.tsx.
   *
   * It is NOT placed into the URL.
   *
   * The backend uses the secure session.
   */
  stats:
    (_userId?: string) =>
      http<Stats>(
        "/api/stats",
      ),

  /* =======================================================
     REVIEW
     ======================================================= */

  review:
    (_userId?: string) =>
      http<{
        missed: NotebookItem[];
      }>(
        "/api/review",
      ),

  /* =======================================================
     EMAIL
     ======================================================= */

  notifications:
    (_email?: string) =>
      http<{
        items: EmailItem[];
      }>(
        "/api/notifications",
      ),

  sendTestEmail:
    (_email?: string) =>
      http<{
        ok: boolean;
        message?: string;
      }>(
        "/api/notifications/send",
        {
          method: "POST",
        },
      ),
};