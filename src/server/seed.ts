import { db } from "@/db";
import { questionBank } from "@/db/schema";
import { ALL_QUESTIONS } from "./bank";

let checked = false;

/** Lazily fills the question bank on first use (idempotent). */
export async function ensureSeeded(): Promise<void> {
  if (checked) return;
  const rows = await db
    .select({ id: questionBank.id })
    .from(questionBank)
    .limit(1);
  if (rows.length === 0) {
    await db
      .insert(questionBank)
      .values(
        ALL_QUESTIONS.map((q) => ({
          category: q.category,
          difficulty: q.difficulty,
          passageKey: q.passageKey ?? null,
          passageText: q.passageText ?? null,
          prompt: q.prompt,
          options: JSON.stringify(q.options),
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          timeLimit: q.timeLimit,
        })),
      );
  }
  checked = true;
}
