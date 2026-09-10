import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  registrations,
} from "@/db/schema";

import {
  cleanEmail,
  isValidEmail,
  sendEmail,
} from "@/server/api-utils";

import {
  getSession,
  hashPassword,
  isStrongPassword,
  rotateSessionToUser,
  verifyCaptcha,
} from "@/server/auth";

export const dynamic =
  "force-dynamic";

export async function POST(
  req: Request,
) {
  let body: {
    name?: string;
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

  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Session expired. Refresh the page and try again.",
      },
      { status: 401 },
    );
  }

  const name =
    (body.name || "")
      .trim()
      .slice(0, 60);

  const email =
    cleanEmail(
      body.email || "",
    );

  const password =
    body.password || "";

  if (name.length < 2) {
    return NextResponse.json(
      {
        error:
          "Name must contain at least 2 characters.",
      },
      { status: 400 },
    );
  }

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

  if (
    !isStrongPassword(
      password,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Password must be at least 8 characters and contain at least one letter and one number.",
      },
      { status: 400 },
    );
  }

  if (
    !verifyCaptcha(
      body.captchaToken || "",
      body.captchaAnswer || "",
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

  const existingRows =
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

  if (existingRows[0]) {
    return NextResponse.json(
      {
        error:
          "An account already exists with this email. Please use Login.",
        code:
          "ACCOUNT_EXISTS",
      },
      { status: 409 },
    );
  }

  const passwordHash =
    hashPassword(
      password,
    );

  let user;

  try {
    const inserted =
      await db
        .insert(registrations)
        .values({
          name,
          email,
          passwordHash,
        })
        .returning({
          id:
            registrations.id,

          name:
            registrations.name,

          email:
            registrations.email,
        });

    user =
      inserted[0];
  } catch (error) {
    console.error(
      "REGISTER DB ERROR:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Could not create the account.",
      },
      { status: 500 },
    );
  }

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Could not create the account.",
      },
      { status: 500 },
    );
  }

  /*
   * Automatically log the newly
   * registered user in.
   */
  await rotateSessionToUser(
    user.email,
  );

  /*
   * Welcome email is intentionally
   * asynchronous.
   *
   * Account creation does not fail
   * just because SMTP is temporarily
   * unavailable.
   */
  void sendEmail(
    user.email,
    "welcome",
    "InterviewArena — welcome!",
    [
      `Hi ${user.name},`,
      "",
      "Your InterviewArena account has been created successfully.",
      "",
      "Your password is securely hashed on the server.",
      "",
      "You can now log in using your email and password.",
      "",
      "You'll receive your practice score by email after completed rounds.",
      "",
      "— InterviewArena",
    ].join("\n"),
  ).catch(
    (error) => {
      console.error(
        "WELCOME EMAIL ERROR:",
        error,
      );
    },
  );

  return NextResponse.json({
    ok: true,

    registered: true,

    authenticated: true,

    id:
      user.email,

    name:
      user.name,

    email:
      user.email,

    message:
      "Registration successful.",
  });
}