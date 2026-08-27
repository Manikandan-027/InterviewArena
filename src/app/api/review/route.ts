import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { answers } from "@/db/schema";

export const dynamic = "force-dynamic";

/** The Missed notebook — recent wrong answers with the correct one attached. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || "";
  if (!userId || userId.length > 64) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(answers)
    .where(and(eq(answers.userId, userId), eq(answers.isCorrect, false)))
    .orderBy(desc(answers.createdAt))
    .limit(12);

  return NextResponse.json({
    missed: rows.map((r) => ({
      id: r.id,
      category: r.category,
      question: r.question,
      options: JSON.parse(r.options) as string[],
      correctIndex: r.correctIndex,
      userAnswer: r.userAnswer,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
