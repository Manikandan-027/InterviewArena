import crypto from "node:crypto";

import { NextResponse } from "next/server";

import {
  createSession,
  getSession,
  setSessionCookie,
} from "@/server/auth";

export const dynamic =
  "force-dynamic";

export async function GET() {
  try {
    const existing =
      await getSession();

    if (existing) {
      const authenticated =
        !!existing.registration &&
        !!existing.registration
          .passwordHash;

      return NextResponse.json(
        {
          authenticated,

          id:
            existing.userId,

          name:
            existing.registration
              ?.name ??
            "Candidate",

          email:
            existing.registration
              ?.email ??
            "",
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    /*
     * Create a server-side anonymous
     * session.
     *
     * This is NOT an account.
     */
    const anonymousId =
      `anon-${crypto.randomUUID()}`;

    const sessionId =
      await createSession(
        anonymousId,
      );

    await setSessionCookie(
      sessionId,
    );

    return NextResponse.json(
      {
        authenticated: false,

        id:
          anonymousId,

        name:
          "Candidate",

        email:
          "",
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "SESSION ERROR:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Could not establish a secure session.",
      },
      { status: 500 },
    );
  }
}