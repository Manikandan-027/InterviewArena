import { NextResponse } from "next/server";

import {
  cleanEmail,
  isValidEmail,
  sendEmail,
} from "@/server/api-utils";

export const dynamic = "force-dynamic";

/**
 * Sends a real SMTP test email.
 */
export async function POST(req: Request) {
  try {
    let body: { email?: string };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid JSON body.",
        },
        { status: 400 },
      );
    }

    const email = cleanEmail(body.email || "");

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please provide a valid email address.",
        },
        { status: 400 },
      );
    }

    await sendEmail(
      email,
      "test",
      "InterviewArena — Test Email",
      "This is a test email from InterviewArena. Your SMTP email notification system is working correctly.",
    );

    return NextResponse.json({
      ok: true,
      message: `Test email sent successfully to ${email}.`,
    });
  } catch (error) {
    console.error("TEST EMAIL ERROR:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Unknown error while sending test email.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}