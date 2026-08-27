import { NextResponse } from "next/server";
import { db } from "@/db";
import { registrations } from "@/db/schema";
import { cleanEmail, isValidEmail, sendEmail } from "@/server/api-utils";

export const dynamic = "force-dynamic";

/** Registers an email address for score notifications and sends a welcome email. */
export async function POST(req: Request) {
  let body: { name?: string; email?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const name = (body.name || "").trim().slice(0, 60);
  const email = cleanEmail(body.email || "");
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });

  await db.insert(registrations).values({ name, email }).onConflictDoUpdate({ target: registrations.email, set: { name } });

  await sendEmail(email, "welcome", "InterviewArena — you're linked", `Hi ${name},\n\nYour email is linked to InterviewArena. You'll get a score email after every practice round with your score, accuracy and rating.\n\nStart with the Grammar section!`);

  return NextResponse.json({ ok: true, email, name });
}
