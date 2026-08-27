import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { cleanEmail, isValidEmail } from "@/server/api-utils";

export const dynamic = "force-dynamic";

/**
 * Email inbox for a registered email address.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const email = cleanEmail(
    searchParams.get("email") || "",
  );

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Invalid email" },
      { status: 400 },
    );
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.email, email))
    .orderBy(desc(notifications.createdAt))
    .limit(30);

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      event: r.event,
      title: r.title,
      body: r.body,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}