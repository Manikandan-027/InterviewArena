import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { answers, attempts, questionBank } from "@/db/schema";
import {
  cleanEmail,
  isCategory,
  isValidEmail,
  ratingFor,
  SECTION_LABEL,
  sendEmail,
} from "@/server/api-utils";

export const dynamic = "force-dynamic";

type ResultIn = { questionId: number; answer: number; timeTakenMs: number };

/** Scores a finished round, stores attempt + every answer, then sends the score email. */
export async function POST(req: Request) {
  let body: {
    userId?: string;
    category?: string;
    durationMs?: number;
    email?: string;
    results?: ResultIn[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = (body.userId || "").trim();
  if (!userId || userId.length > 64) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  const category = body.category ?? "";
  if (!isCategory(category)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }
  const results = Array.isArray(body.results) ? body.results : [];
  if (results.length === 0 || results.length > 10) {
    return NextResponse.json({ error: "results is required" }, { status: 400 });
  }

  const ids = results.map((r) => Number(r.questionId)).filter((n) => n > 0);
  const rows = await db
    .select()
    .from(questionBank)
    .where(inArray(questionBank.id, ids));
  const byId = new Map(rows.map((r) => [r.id as number, r]));
  if (rows.length !== new Set(ids).size) {
    return NextResponse.json({ error: "Unknown questions" }, { status: 400 });
  }

  let score = 0;
  let correct = 0;
  const graded = results.map((r) => {
    const q = byId.get(Number(r.questionId));
    const answer = Number.isInteger(r.answer) ? r.answer : -1;
    const timeTakenMs = Math.min(
      Math.max(0, Number(r.timeTakenMs) || 0),
      (q?.timeLimit ?? 40) * 1000,
    );
    const isCorrect = q ? answer === q.correctIndex : false;
    if (isCorrect) {
      correct += 1;
      const secsLeft = Math.max(
        0,
        (q!.timeLimit * 1000 - timeTakenMs) / 1000,
      );
      const bonus = Math.min(10, Math.floor(secsLeft * 2));
      score += 20 + bonus;
    }
    return { q: q!, answer, timeTakenMs, isCorrect };
  });

  const total = graded.length;
  const accuracy = Math.round((correct / total) * 100);
  const rating = ratingFor(accuracy);
  const durationMs = Math.max(0, Number(body.durationMs) || 0);

  const [attempt] = await db
    .insert(attempts)
    .values({
      userId,
      category,
      score,
      correct,
      total,
      accuracy,
      durationMs,
      rating,
    })
    .returning({ id: attempts.id });

  await db.insert(answers).values(
    graded.map((g) => ({
      attemptId: attempt.id,
      userId,
      questionId: g.q.id!,
      category: g.q.category,
      question: g.q.prompt,
      options: g.q.options,
      correctIndex: g.q.correctIndex,
      userAnswer: g.answer,
      isCorrect: g.isCorrect,
      timeTakenMs: g.timeTakenMs,
    })),
  );

  const email = cleanEmail(body.email || "");
  if (isValidEmail(email)) {
    await sendEmail(
      email,
      "round_complete",
      "InterviewArena — round complete",
      `${SECTION_LABEL[category]}: ${correct}/${total} correct (${accuracy}%). ${score} pts — ${rating}. Fresh questions are ready, take another round!`,
    );
  }

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      score,
      correct,
      total,
      accuracy,
      durationMs,
      rating,
      emailSent: isValidEmail(email),
    },
    results: graded.map((g) => ({
      questionId: g.q.id,
      correct: g.isCorrect,
      correctIndex: g.q.correctIndex,
      explanation: g.q.explanation,
    })),
  });
}
