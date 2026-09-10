import { NextResponse } from "next/server";

import {
  logoutSession,
} from "@/server/auth";

export const dynamic =
  "force-dynamic";

export async function POST() {
  try {
    await logoutSession();

    return NextResponse.json({
      ok: true,

      authenticated: false,
    });
  } catch (error) {
    console.error(
      "LOGOUT ERROR:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Could not log out.",
      },
      { status: 500 },
    );
  }
}