import { NextResponse } from "next/server";
import {
  desc,
  eq,
} from "drizzle-orm";

import { db } from "@/db";
import {
  notifications,
} from "@/db/schema";

import {
  getSession,
} from "@/server/auth";

export const dynamic =
  "force-dynamic";

export async function GET() {
  const session =
    await getSession();

  if (
    !session ||
    !session.registration ||
    !session.registration.passwordHash
  ) {
    return NextResponse.json(
      {
        error:
          "Please login to view your emails.",
      },
      { status: 401 },
    );
  }

  /*
   * Recipient is determined by
   * the authenticated account.
   */
  const email =
    session.registration.email;

  const rows =
    await db
      .select()
      .from(notifications)
      .where(
        eq(
          notifications.email,
          email,
        ),
      )
      .orderBy(
        desc(
          notifications.createdAt,
        ),
      )
      .limit(30);

  return NextResponse.json({
    items:
      rows.map(
        (row) => ({
          id:
            row.id,

          event:
            row.event,

          title:
            row.title,

          body:
            row.body,

          status:
            row.status,

          createdAt:
            row.createdAt.toISOString(),
        }),
      ),
  });
}