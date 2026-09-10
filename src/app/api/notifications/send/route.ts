import { NextResponse } from "next/server";

import {
  sendEmail,
} from "@/server/api-utils";

import {
  getSession,
} from "@/server/auth";

export const dynamic =
  "force-dynamic";

export async function POST() {
  try {
    const session =
      await getSession();

    if (
      !session ||
      !session.registration ||
      !session.registration.passwordHash
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Please login before sending a test email.",
        },
        { status: 401 },
      );
    }

    /*
     * IMPORTANT:
     *
     * We DO NOT accept an email from
     * the request body.
     *
     * The server gets it from the
     * authenticated account.
     */
    const email =
      session.registration.email;

    await sendEmail(
      email,

      "test",

      "InterviewArena — Test Email",

      [
        "Hello!",

        "",

        "This is a test email from InterviewArena.",

        "",

        "Your SMTP email notification system is working correctly.",

        "",

        "— InterviewArena",
      ].join("\n"),
    );

    return NextResponse.json({
      ok: true,

      message:
        `Test email sent successfully to ${email}.`,
    });
  } catch (error) {
    console.error(
      "TEST EMAIL ERROR:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Could not send the test email.",
      },
      { status: 502 },
    );
  }
}