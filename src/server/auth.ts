import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import {
  authSessions,
  registrations,
} from "@/db/schema";

export const SESSION_COOKIE =
  "ia_session";

const SESSION_DAYS = 30;

const SESSION_MS =
  SESSION_DAYS *
  24 *
  60 *
  60 *
  1000;

const CAPTCHA_MAX_AGE =
  10 * 60 * 1000;

/* =========================================================
   PASSWORD
   ========================================================= */

function randomId(
  bytes = 32,
): string {
  return crypto
    .randomBytes(bytes)
    .toString("hex");
}

export function hashPassword(
  password: string,
): string {
  const salt =
    crypto
      .randomBytes(16)
      .toString("hex");

  const derived =
    crypto.scryptSync(
      password,
      salt,
      64,
    );

  return [
    "scrypt",
    salt,
    derived.toString("hex"),
  ].join(":");
}

export function verifyPassword(
  password: string,
  stored: string,
): boolean {
  try {
    const parts =
      stored.split(":");

    if (parts.length !== 3) {
      return false;
    }

    const [
      algorithm,
      salt,
      expectedHex,
    ] = parts;

    if (
      algorithm !== "scrypt" ||
      !salt ||
      !expectedHex
    ) {
      return false;
    }

    const expected =
      Buffer.from(
        expectedHex,
        "hex",
      );

    const actual =
      crypto.scryptSync(
        password,
        salt,
        expected.length,
      );

    if (
      actual.length !==
      expected.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      actual,
      expected,
    );
  } catch {
    return false;
  }
}

export function isStrongPassword(
  password: string,
): boolean {
  return (
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}

/* =========================================================
   AUTH SECRET
   ========================================================= */

function authSecret(): string {
  const secret =
    process.env.AUTH_SECRET;

  if (
    !secret ||
    secret.length < 32
  ) {
    throw new Error(
      "AUTH_SECRET must be configured and contain at least 32 characters.",
    );
  }

  return secret;
}

/* =========================================================
   CAPTCHA
   ========================================================= */

export function createCaptcha(): {
  token: string;
  question: string;
} {
  const a =
    crypto.randomInt(2, 10);

  const b =
    crypto.randomInt(2, 10);

  const addition =
    crypto.randomInt(0, 2) === 0;

  const operator =
    addition ? "+" : "-";

  const answer =
    addition
      ? a + b
      : a - b;

  const issuedAt =
    Date.now();

  const payload =
    [
      a,
      b,
      operator,
      answer,
      issuedAt,
    ].join("|");

  const signature =
    crypto
      .createHmac(
        "sha256",
        authSecret(),
      )
      .update(payload)
      .digest("hex");

  const token =
    Buffer.from(
      `${payload}|${signature}`,
      "utf8",
    ).toString(
      "base64url",
    );

  return {
    token,

    question:
      `${a} ${operator} ${b} = ?`,
  };
}

export function verifyCaptcha(
  token: string,
  answer: string,
): boolean {
  try {
    if (
      !token ||
      !answer
    ) {
      return false;
    }

    const decoded =
      Buffer.from(
        token,
        "base64url",
      ).toString("utf8");

    const parts =
      decoded.split("|");

    if (parts.length !== 6) {
      return false;
    }

    const [
      a,
      b,
      operator,
      expectedAnswer,
      issuedAtString,
      signature,
    ] = parts;

    const issuedAt =
      Number(issuedAtString);

    if (
      !Number.isFinite(
        issuedAt,
      )
    ) {
      return false;
    }

    const age =
      Date.now() -
      issuedAt;

    if (
      age < 0 ||
      age > CAPTCHA_MAX_AGE
    ) {
      return false;
    }

    const payload =
      [
        a,
        b,
        operator,
        expectedAnswer,
        issuedAtString,
      ].join("|");

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          authSecret(),
        )
        .update(payload)
        .digest("hex");

    const actualBuffer =
      Buffer.from(
        signature,
        "hex",
      );

    const expectedBuffer =
      Buffer.from(
        expectedSignature,
        "hex",
      );

    if (
      actualBuffer.length !==
      expectedBuffer.length
    ) {
      return false;
    }

    if (
      !crypto.timingSafeEqual(
        actualBuffer,
        expectedBuffer,
      )
    ) {
      return false;
    }

    return (
      Number(answer.trim()) ===
      Number(expectedAnswer)
    );
  } catch {
    return false;
  }
}

/* =========================================================
   SESSION
   ========================================================= */

export async function createSession(
  userId: string,
): Promise<string> {
  const sessionId =
    randomId();

  const expiresAt =
    new Date(
      Date.now() +
        SESSION_MS,
    );

  await db
    .insert(authSessions)
    .values({
      id: sessionId,
      userId,
      expiresAt,
    });

  return sessionId;
}

export async function setSessionCookie(
  sessionId: string,
): Promise<void> {
  const cookieStore =
    await cookies();

  cookieStore.set(
    SESSION_COOKIE,
    sessionId,
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite: "lax",

      path: "/",

      maxAge:
        SESSION_DAYS *
        24 *
        60 *
        60,
    },
  );
}

export async function getSession() {
  const cookieStore =
    await cookies();

  const sessionId =
    cookieStore.get(
      SESSION_COOKIE,
    )?.value;

  if (!sessionId) {
    return null;
  }

  const rows =
    await db
      .select({
        session:
          authSessions,

        registration:
          registrations,
      })
      .from(authSessions)
      .leftJoin(
        registrations,
        eq(
          registrations.email,
          authSessions.userId,
        ),
      )
      .where(
        and(
          eq(
            authSessions.id,
            sessionId,
          ),

          gt(
            authSessions.expiresAt,
            new Date(),
          ),
        ),
      )
      .limit(1);

  const row =
    rows[0];

  if (!row) {
    return null;
  }

  return {
    sessionId:
      row.session.id,

    userId:
      row.session.userId,

    expiresAt:
      row.session.expiresAt,

    registration:
      row.registration,
  };
}

export async function requireAuth() {
  const session =
    await getSession();

  if (
    !session ||
    !session.registration ||
    !session.registration.passwordHash
  ) {
    throw new Error(
      "UNAUTHENTICATED",
    );
  }

  return session;
}

/**
 * Convert the current session into an
 * authenticated account session.
 */
export async function loginSession(
  userId: string,
): Promise<void> {
  const session =
    await getSession();

  if (!session) {
    throw new Error(
      "SESSION_EXPIRED",
    );
  }

  await db
    .update(authSessions)
    .set({
      userId,

      expiresAt:
        new Date(
          Date.now() +
            SESSION_MS,
        ),
    })
    .where(
      eq(
        authSessions.id,
        session.sessionId,
      ),
    );

  await setSessionCookie(
    session.sessionId,
  );
}

export async function rotateSessionToUser(
  userId: string,
): Promise<void> {
  await loginSession(
    userId,
  );
}

export async function logoutSession(): Promise<void> {
  const cookieStore =
    await cookies();

  const sessionId =
    cookieStore.get(
      SESSION_COOKIE,
    )?.value;

  if (sessionId) {
    await db
      .delete(authSessions)
      .where(
        eq(
          authSessions.id,
          sessionId,
        ),
      );
  }

  cookieStore.set(
    SESSION_COOKIE,
    "",
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    },
  );
}