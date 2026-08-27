import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { questionBank, questionUsage } from "@/db/schema";
import { ensureSeeded } from "@/server/seed";
import { isCategory, shuffle } from "@/server/api-utils";

export const dynamic = "force-dynamic";

/**
 * Serves a random round for a category.
 *
 * Reading / Listening:
 * - 3 questions per round
 * - Uses one passage per round
 * - Avoids recently used passages
 * - Avoids recently used questions
 *
 * Other sections:
 * - 5 questions per round
 * - Avoids recently used questions
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  if (!isCategory(category)) {
    return NextResponse.json(
      { error: "Unknown category" },
      { status: 400 },
    );
  }

  const isPassage = category === "reading" || category === "listening";
  const count = isPassage ? 3 : 5;

  try {
    await ensureSeeded();
  } catch {
    return NextResponse.json(
      {
        error:
          "Question bank is not ready yet. Try again in a moment.",
      },
      { status: 503 },
    );
  }

  try {
    // ---------------------------------------------------------
    // Get complete question bank for this category
    // ---------------------------------------------------------

    const bank = await db
      .select()
      .from(questionBank)
      .where(eq(questionBank.category, category));

    if (bank.length < count) {
      return NextResponse.json(
        {
          error: `Not enough questions available for ${category}.`,
        },
        { status: 503 },
      );
    }

    // ---------------------------------------------------------
    // Get recently used question IDs
    // ---------------------------------------------------------

    const recentLimit = isPassage
      ? 30
      : Math.max(count * 6, 30);

    const recentRows = await db
      .select({
        questionId: questionUsage.questionId,
      })
      .from(questionUsage)
      .where(eq(questionUsage.category, category))
      .orderBy(desc(questionUsage.usedAt))
      .limit(recentLimit);

    const recentQuestionIds = new Set(
      recentRows.map((row) => row.questionId),
    );

    // ---------------------------------------------------------
    // PASSAGE BASED SECTIONS
    // Reading / Listening
    // ---------------------------------------------------------

    if (isPassage) {
      const passages = [
        ...new Set(
          bank
            .map((q) => q.passageKey)
            .filter(
              (key): key is string =>
                typeof key === "string" && key.length > 0,
            ),
        ),
      ];

      if (passages.length === 0) {
        return NextResponse.json(
          {
            error: `No passages found for ${category}.`,
          },
          { status: 503 },
        );
      }

      // Find passages that contain enough questions.
      const validPassages = passages.filter((passageKey) => {
        const questions = bank.filter(
          (q) => q.passageKey === passageKey,
        );

        return questions.length >= count;
      });

      if (validPassages.length === 0) {
        return NextResponse.json(
          {
            error: `Not enough questions in any ${category} passage.`,
          },
          { status: 503 },
        );
      }

      // -------------------------------------------------------
      // Calculate how many questions from each passage were
      // recently used.
      // -------------------------------------------------------

      const passageUsageCount = new Map<string, number>();

      for (const passageKey of validPassages) {
        const usedCount = bank.filter(
          (q) =>
            q.passageKey === passageKey &&
            q.id != null &&
            recentQuestionIds.has(q.id),
        ).length;

        passageUsageCount.set(passageKey, usedCount);
      }

      // Prefer passages with ZERO recently used questions.
      let freshPassages = validPassages.filter(
        (key) => (passageUsageCount.get(key) ?? 0) === 0,
      );

      // If all passages have been used recently, choose the
      // passages with the fewest recently used questions.
      if (freshPassages.length === 0) {
        const minimumUsage = Math.min(
          ...validPassages.map(
            (key) => passageUsageCount.get(key) ?? 0,
          ),
        );

        freshPassages = validPassages.filter(
          (key) =>
            (passageUsageCount.get(key) ?? 0) === minimumUsage,
        );
      }

      // Randomly select one passage.
      const selectedPassageKey =
        shuffle(freshPassages)[0];

      // -------------------------------------------------------
      // Select questions from that passage.
      // Prefer questions that were NOT recently used.
      // -------------------------------------------------------

      const passageQuestions = bank.filter(
        (q) => q.passageKey === selectedPassageKey,
      );

      const freshQuestions = passageQuestions.filter(
        (q) =>
          q.id != null &&
          !recentQuestionIds.has(q.id),
      );

      let chosenQuestions =
        freshQuestions.length >= count
          ? shuffle(freshQuestions).slice(0, count)
          : shuffle(passageQuestions).slice(0, count);

      // Extra safety: never return duplicate IDs.
      const unique = new Map<number, (typeof bank)[number]>();

      for (const question of chosenQuestions) {
        if (question.id != null) {
          unique.set(question.id, question);
        }
      }

      chosenQuestions = [...unique.values()];

      if (chosenQuestions.length < count) {
        return NextResponse.json(
          {
            error:
              "Could not create a unique question round. Please try again.",
          },
          { status: 503 },
        );
      }

      // Record usage.
      await db.insert(questionUsage).values(
        chosenQuestions.map((q) => ({
          questionId: q.id!,
          category,
        })),
      );

      return NextResponse.json({
        category,
        questions: chosenQuestions.map((q) => ({
          id: q.id,
          category: q.category,
          difficulty: q.difficulty,
          prompt: q.prompt,
          options: JSON.parse(q.options) as string[],
          timeLimit: q.timeLimit,
          passageKey: q.passageKey,
          passageText: q.passageText,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        })),
      });
    }

    // ---------------------------------------------------------
    // NORMAL SECTIONS
    // Grammar / Verbal / Logical
    // ---------------------------------------------------------

    const freshQuestions = bank.filter(
      (q) =>
        q.id != null &&
        !recentQuestionIds.has(q.id),
    );

    // Prefer fresh questions.
    // If the entire bank has recently been used, reset the
    // selection pool automatically.
    const pool =
      freshQuestions.length >= count
        ? freshQuestions
        : bank;

    const chosenQuestions = shuffle(pool).slice(0, count);

    // Extra safety against duplicate question IDs.
    const uniqueQuestions = [
      ...new Map(
        chosenQuestions
          .filter((q) => q.id != null)
          .map((q) => [q.id!, q]),
      ).values(),
    ].slice(0, count);

    if (uniqueQuestions.length < count) {
      return NextResponse.json(
        {
          error:
            "Could not create a unique question round.",
        },
        { status: 503 },
      );
    }

    await db.insert(questionUsage).values(
      uniqueQuestions.map((q) => ({
        questionId: q.id!,
        category,
      })),
    );

    return NextResponse.json({
      category,
      questions: uniqueQuestions.map((q) => ({
        id: q.id,
        category: q.category,
        difficulty: q.difficulty,
        prompt: q.prompt,
        options: JSON.parse(q.options) as string[],
        timeLimit: q.timeLimit,
        passageKey: q.passageKey,
        passageText: q.passageText,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
      })),
    });
  } catch (error) {
    console.error("Question API error:", error);

    return NextResponse.json(
      {
        error: "Failed to load questions.",
      },
      { status: 500 },
    );
  }
}