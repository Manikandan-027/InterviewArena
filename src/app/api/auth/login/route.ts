import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  registrations,
} from "@/db/schema";

import {
  cleanEmail,
  isValidEmail,
} from "@/server/api-utils";

import {
  getSession,
  loginSession,
  verifyCaptcha,
  verifyPassword,
} from "@/server/auth";

export const dynamic =
  "force-dynamic";

export async function POST(
  req: Request,
) {
  let body: {
    email?: string;
    password?: string;
    captchaToken?: string;
    captchaAnswer?: string;
  };

  try {
    body =
      await req.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request.",
      },
      { status: 400 },
    );
  }

  const email =
    cleanEmail(
      body.email || "",
    );

  const password =
    body.password || "";

  const captchaToken =
    body.captchaToken || "";

  const captchaAnswer =
    body.captchaAnswer || "";

  if (
    !isValidEmail(
      email,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Enter a valid email address.",
      },
      { status: 400 },
    );
  }

  if (!password) {
    return NextResponse.json(
      {
        error:
          "Password is required.",
      },
      { status: 400 },
    );
  }

  if (
    !verifyCaptcha(
      captchaToken,
      captchaAnswer,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "CAPTCHA is incorrect or expired. Please try again.",
      },
      { status: 400 },
    );
  }

  const rows =
    await db
      .select()
      .from(registrations)
      .where(
        eq(
          registrations.email,
          email,
        ),
      )
      .limit(1);

  const user =
    rows[0];

  /*
   * Existing email-only legacy rows
   * cannot be logged into because they
   * don't have a password.
   */
  if (
    !user ||
    !user.passwordHash
  ) {
    return NextResponse.json(
      {
        error:
          "No secure account exists for this email. Please register a new account.",
        code:
          "ACCOUNT_NOT_FOUND",
      },
      { status: 401 },
    );
  }

  if (
    !verifyPassword(
      password,
      user.passwordHash,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Incorrect email or password.",
      },
      { status: 401 },
    );
  }

  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Your session expired. Refresh the page and try again.",
      },
      { status: 401 },
    );
  }

  /*
   * IMPORTANT:
   *
   * The server changes the session
   * to the verified account.
   */
  await loginSession(
    user.email,
  );

  return NextResponse.json({
    ok: true,

    authenticated: true,

    id:
      user.email,

    name:
      user.name,

    email:
      user.email,

    message:
      "Login successful.",
  });
}