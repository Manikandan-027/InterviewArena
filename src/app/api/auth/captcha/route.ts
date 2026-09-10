import { NextResponse } from "next/server";

import {
  createCaptcha,
} from "@/server/auth";

export const dynamic =
  "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      createCaptcha(),
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error(
      "CAPTCHA ERROR:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Authentication security is not configured. Check AUTH_SECRET.",
      },
      { status: 500 },
    );
  }
}