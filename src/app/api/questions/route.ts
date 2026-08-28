import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { questionBank, questionUsage } from "@/db/schema";
import { ensureSeeded } from "@/server/seed";
import { isCategory, shuffle } from "@/server/api-utils";

export const dynamic = "force-dynamic";

/**
 * Remove generated numbering from prompts.
 *
 * Examples:
 * "Choose the grammatically correct sentence 384."
 * "Choose the grammatically correct sentence 4."
 *
 * Both become:
 * "choose the grammatically correct sentence"
 */
function normalizePrompt(prompt: string): string {
  return prompt
    .trim()
    .toLowerCase()
    .replace(/\s+\d+\.?\s*$/, "")
    .replace(/\s+/g, " ");
}

/**
 * Creates a content-based signature.
 *
 * We intentionally use content instead of the database ID.
 * This prevents different IDs containing the same logical
 * question from appearing in the same round.
 *
 * passageKey is included for Reading/Listening so questions
 * belonging to different passages remain separate.
 */
function questionSignature(
  question: (typeof questionBank.$inferSelect),
): string {
  const normalizedPrompt = normalizePrompt(question.prompt);

  let normalizedOptions = question.options;

  try {
    const parsed = JSON.parse(question.options) as string[];

    normalizedOptions = JSON.stringify(
      parsed.map((option) =>
        option.trim().toLowerCase().replace(/\s+/g, " "),
      ),
    );
  } catch {
    normalizedOptions = question.options
      .trim()
      .toLowerCase();
  }

  return JSON.stringify({
    category: question.category,
    passageKey: question.passageKey ?? "",
    prompt: normalizedPrompt,
    options: normalizedOptions,
    correctIndex: question.correctIndex,
  });
}

/**
 * Convert question rows into a unique content pool.
 *
 * If several database records are actually copies of the
 * same logical question, only one record is kept.
 */
function uniqueByContent(
  questions: (typeof questionBank.$inferSelect)[],
): (typeof questionBank.$inferSelect)[] {
  const seen = new Set<string>();
  const result: (typeof questionBank.$inferSelect)[] = [];

  for (const question of questions) {
    if (question.id == null) {
      continue;
    }

    const signature = questionSignature(question);

    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    result.push(question);
  }

  return result;
}

/**
 * Serves a random round.
 *
 * Grammar / Verbal / Logical:
 * - 5 questions
 * - no duplicate logical question in the same round
 * - avoids recently served logical duplicates
 *
 * Reading / Listening:
 * - 3 questions
 * - one passage per round
 * - avoids recently used passages/questions
 * - no duplicate logical question in the same round
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

  const isPassage =
    category === "reading" ||
    category === "listening";

  const count = isPassage ? 3 : 5;

  try {
    await ensureSeeded();
  } catch (error) {
    console.error("Question seed error:", error);

    return NextResponse.json(
      {
        error:
          "Question bank is not ready yet. Try again in a moment.",
      },
      { status: 503 },
    );
  }

  try {
    // =========================================================
    // LOAD BANK
    // =========================================================

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

    // =========================================================
    // RECENTLY USED QUESTIONS
    // =========================================================

    const recentLimit = isPassage
      ? 60
      : Math.max(count * 10, 50);

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

    // =========================================================
    // CONVERT RECENT IDS INTO CONTENT SIGNATURES
    // =========================================================
    //
    // This is the important part for your current database.
    //
    // Example:
    //
    // ID 4 and ID 384 have different IDs,
    // but identical question content.
    //
    // We treat them as one logical question.
    // =========================================================

    const recentQuestions = bank.filter(
      (question) =>
        question.id != null &&
        recentQuestionIds.has(question.id),
    );

    const recentSignatures = new Set<string>(
      recentQuestions.map(questionSignature),
    );

    // =========================================================
    // PASSAGE SECTIONS
    // READING / LISTENING
    // =========================================================

    if (isPassage) {
      const passages = [
        ...new Set(
          bank
            .map((question) => question.passageKey)
            .filter(
              (key): key is string =>
                typeof key === "string" &&
                key.length > 0,
            ),
        ),
      ];

      if (passages.length === 0) {
        return NextResponse.json(
          {
            error:
              `No passages found for ${category}.`,
          },
          { status: 503 },
        );
      }

      // -------------------------------------------------------
      // A passage must contain enough unique questions
      // -------------------------------------------------------

      const validPassages = passages.filter(
        (passageKey) => {
          const passageQuestions = uniqueByContent(
            bank.filter(
              (question) =>
                question.passageKey === passageKey,
            ),
          );

          return passageQuestions.length >= count;
        },
      );

      if (validPassages.length === 0) {
        return NextResponse.json(
          {
            error:
              `Not enough unique questions in any ${category} passage.`,
          },
          { status: 503 },
        );
      }

      // -------------------------------------------------------
      // Calculate recent usage for every passage
      // -------------------------------------------------------

      const passageScores = new Map<
        string,
        number
      >();

      for (const passageKey of validPassages) {
        const passageQuestions =
          uniqueByContent(
            bank.filter(
              (question) =>
                question.passageKey === passageKey,
            ),
          );

        let recentlyUsed = 0;

        for (const question of passageQuestions) {
          const signature =
            questionSignature(question);

          if (
            (question.id != null &&
              recentQuestionIds.has(question.id)) ||
            recentSignatures.has(signature)
          ) {
            recentlyUsed += 1;
          }
        }

        passageScores.set(
          passageKey,
          recentlyUsed,
        );
      }

      // -------------------------------------------------------
      // Prefer passages containing ZERO recently used questions
      // -------------------------------------------------------

      let candidatePassages =
        validPassages.filter(
          (passageKey) =>
            (passageScores.get(passageKey) ?? 0) ===
            0,
        );

      // -------------------------------------------------------
      // If every passage has been used recently,
      // choose the least-used passages.
      // -------------------------------------------------------

      if (candidatePassages.length === 0) {
        const minimumUsage = Math.min(
          ...validPassages.map(
            (passageKey) =>
              passageScores.get(passageKey) ?? 0,
          ),
        );

        candidatePassages =
          validPassages.filter(
            (passageKey) =>
              (passageScores.get(passageKey) ?? 0) ===
              minimumUsage,
          );
      }

      if (candidatePassages.length === 0) {
        return NextResponse.json(
          {
            error:
              "Could not find an available passage.",
          },
          { status: 503 },
        );
      }

      // Randomly select the passage.
      const selectedPassageKey =
        shuffle(candidatePassages)[0];

      // -------------------------------------------------------
      // QUESTIONS IN SELECTED PASSAGE
      // -------------------------------------------------------

      const passageQuestions =
        uniqueByContent(
          bank.filter(
            (question) =>
              question.passageKey ===
              selectedPassageKey,
          ),
        );

      // Prefer completely fresh logical questions.
      const freshQuestions =
        passageQuestions.filter((question) => {
          if (question.id == null) {
            return false;
          }

          const signature =
            questionSignature(question);

          return (
            !recentQuestionIds.has(question.id) &&
            !recentSignatures.has(signature)
          );
        });

      let chosenQuestions: (
        typeof bank[number]
      )[] = [];

      if (freshQuestions.length >= count) {
        chosenQuestions = shuffle(
          freshQuestions,
        ).slice(0, count);
      } else {
        // We may need to reuse something because the
        // current passage does not have enough untouched
        // questions.
        chosenQuestions = shuffle(
          passageQuestions,
        ).slice(0, count);
      }

      // -------------------------------------------------------
      // FINAL CONTENT-LEVEL DEDUPLICATION
      // -------------------------------------------------------

      const seen = new Set<string>();

      chosenQuestions =
        chosenQuestions.filter((question) => {
          const signature =
            questionSignature(question);

          if (seen.has(signature)) {
            return false;
          }

          seen.add(signature);
          return true;
        });

      if (chosenQuestions.length < count) {
        return NextResponse.json(
          {
            error:
              "Could not create a unique question round. Please try again.",
          },
          { status: 503 },
        );
      }

      // -------------------------------------------------------
      // RECORD USAGE
      // -------------------------------------------------------

      await db.insert(questionUsage).values(
        chosenQuestions.map((question) => ({
          questionId: question.id!,
          category,
        })),
      );

      return NextResponse.json({
        category,

        questions: chosenQuestions.map(
          (question) => ({
            id: question.id,
            category: question.category,
            difficulty: question.difficulty,
            prompt: question.prompt,
            options: JSON.parse(
              question.options,
            ) as string[],
            timeLimit: question.timeLimit,
            passageKey: question.passageKey,
            passageText: question.passageText,
            correctIndex:
              question.correctIndex,
            explanation:
              question.explanation,
          }),
        ),
      });
    }

    // =========================================================
    // NORMAL SECTIONS
    // GRAMMAR / VERBAL / LOGICAL
    // =========================================================

    // First remove duplicate logical questions from the bank.
    const contentUniqueBank =
      uniqueByContent(bank);

    // Prefer questions that are both:
    // 1. not recently used by ID
    // 2. not recently used by content
    const freshQuestions =
      contentUniqueBank.filter((question) => {
        if (question.id == null) {
          return false;
        }

        const signature =
          questionSignature(question);

        return (
          !recentQuestionIds.has(question.id) &&
          !recentSignatures.has(signature)
        );
      });

    // If enough fresh logical questions exist,
    // use only those.
    //
    // Otherwise use the content-unique bank.
    const pool =
      freshQuestions.length >= count
        ? freshQuestions
        : contentUniqueBank;

    const shuffledPool = shuffle(pool);

    const chosenQuestions: (
      typeof bank[number]
    )[] = [];

    const seen = new Set<string>();

    for (const question of shuffledPool) {
      if (question.id == null) {
        continue;
      }

      const signature =
        questionSignature(question);

      if (seen.has(signature)) {
        continue;
      }

      seen.add(signature);
      chosenQuestions.push(question);

      if (chosenQuestions.length === count) {
        break;
      }
    }

    if (chosenQuestions.length < count) {
      return NextResponse.json(
        {
          error:
            `Not enough unique questions available for ${category}.`,
        },
        { status: 503 },
      );
    }

    // =========================================================
    // RECORD USAGE
    // =========================================================

    await db.insert(questionUsage).values(
      chosenQuestions.map((question) => ({
        questionId: question.id!,
        category,
      })),
    );

    // =========================================================
    // RESPONSE
    // =========================================================

    return NextResponse.json({
      category,

      questions: chosenQuestions.map(
        (question) => ({
          id: question.id,
          category: question.category,
          difficulty: question.difficulty,
          prompt: question.prompt,
          options: JSON.parse(
            question.options,
          ) as string[],
          timeLimit: question.timeLimit,
          passageKey: question.passageKey,
          passageText: question.passageText,
          correctIndex:
            question.correctIndex,
          explanation:
            question.explanation,
        }),
      ),
    });
  } catch (error) {
    console.error(
      "Question API error:",
      error,
    );

    return NextResponse.json(
      {
        error: "Failed to load questions.",
      },
      { status: 500 },
    );
  }
}