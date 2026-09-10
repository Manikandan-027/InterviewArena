import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { questionBank, questionUsage } from "@/db/schema";
import { ensureSeeded } from "@/server/seed";
import { isCategory, shuffle } from "@/server/api-utils";

export const dynamic = "force-dynamic";

type QuestionRow = typeof questionBank.$inferSelect;

const ROUND_SIZE = {
  grammar: 5,
  verbal: 5,
  logical: 5,
  reading: 3,
  listening: 3,
} as const;

/**
 * Converts the database difficulty number into a readable label.
 *
 * 1 = Easy
 * 2 = Medium
 * 3 = Hard
 */
function difficultyLabel(
  difficulty: number,
): "Easy" | "Medium" | "Hard" {
  if (difficulty >= 3) return "Hard";
  if (difficulty === 2) return "Medium";
  return "Easy";
}

/**
 * Normalizes text so that artificial numbering does not make
 * duplicated questions look unique.
 *
 * Example:
 *
 * "Choose the grammatically correct sentence 384."
 * "Choose the grammatically correct sentence 524."
 *
 * both become:
 *
 * "choose the grammatically correct sentence"
 */
function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+\d+\s*\.?\s*$/, "")
    .replace(/\s+/g, " ");
}

/**
 * Safely parse the JSON options stored in PostgreSQL.
 */
function parseOptions(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) return null;

    const options = parsed.filter(
      (item): item is string =>
        typeof item === "string",
    );

    if (options.length !== 4) return null;

    return options;
  } catch {
    return null;
  }
}

/**
 * Creates a content-level signature.
 *
 * We deliberately DON'T use database ID.
 *
 * This prevents:
 *
 * ID 4   = same question
 * ID 384 = same question
 * ID 524 = same question
 *
 * from being treated as three different questions.
 */
function contentSignature(
  question: QuestionRow,
): string {
  const options = parseOptions(question.options) ?? [];

  return JSON.stringify({
    category: question.category,
    passageKey:
      question.passageKey ?? "",
    prompt: normalizeText(question.prompt),
    options: options.map((item) =>
      normalizeText(item),
    ),
    correctIndex: question.correctIndex,
  });
}

/**
 * Remove duplicate logical questions.
 */
function uniqueQuestions(
  rows: QuestionRow[],
): QuestionRow[] {
  const seen = new Set<string>();
  const result: QuestionRow[] = [];

  for (const row of rows) {
    if (row.id == null) continue;

    const options = parseOptions(row.options);

    // Invalid question record.
    if (!options) continue;

    // correctIndex must point to a real option.
    if (
      row.correctIndex < 0 ||
      row.correctIndex >= options.length
    ) {
      continue;
    }

    const signature = contentSignature(row);

    if (seen.has(signature)) continue;

    seen.add(signature);
    result.push(row);
  }

  return result;
}

/**
 * Select questions with a balanced difficulty distribution.
 *
 * For normal sections (5 questions):
 *   1 Easy
 *   3 Medium
 *   1 Hard
 *
 * This gives an interview-style progression without making
 * the whole round unnecessarily difficult.
 */
function chooseBalancedDifficulty(
  rows: QuestionRow[],
  count: number,
  recentSignatures: Set<string>,
): QuestionRow[] {
  const unique = uniqueQuestions(rows);

  const fresh = unique.filter(
    (question) =>
      !recentSignatures.has(
        contentSignature(question),
      ),
  );

  const source =
    fresh.length >= count ? fresh : unique;

  const easy = shuffle(
    source.filter((q) => q.difficulty === 1),
  );

  const medium = shuffle(
    source.filter((q) => q.difficulty === 2),
  );

  const hard = shuffle(
    source.filter((q) => q.difficulty >= 3),
  );

  const chosen: QuestionRow[] = [];
  const used = new Set<string>();

  function take(
    pool: QuestionRow[],
    amount: number,
  ) {
    for (const question of pool) {
      if (chosen.length >= count) break;

      const signature =
        contentSignature(question);

      if (used.has(signature)) continue;

      used.add(signature);
      chosen.push(question);

      if (chosen.length >= amount) break;
    }
  }

  // One easy.
  take(easy, 1);

  // Three medium.
  take(medium, 3);

  // One hard.
  take(hard, 5);

  // If a difficulty bucket doesn't have enough questions,
  // fill from everything else without duplicates.
  if (chosen.length < count) {
    const fallback = shuffle(source);

    for (const question of fallback) {
      if (chosen.length >= count) break;

      const signature =
        contentSignature(question);

      if (used.has(signature)) continue;

      used.add(signature);
      chosen.push(question);
    }
  }

  return chosen.slice(0, count);
}

/**
 * Create a passage-based round.
 *
 * Reading / Listening require one passage and 3 questions.
 */
function choosePassageRound(
  rows: QuestionRow[],
  count: number,
  recentSignatures: Set<string>,
): {
  passageKey: string;
  questions: QuestionRow[];
} | null {
  const passageMap = new Map<
    string,
    QuestionRow[]
  >();

  for (const row of rows) {
    if (!row.passageKey) continue;

    const existing =
      passageMap.get(row.passageKey) ?? [];

    existing.push(row);
    passageMap.set(row.passageKey, existing);
  }

  const validPassages: string[] = [];

  for (const [key, passageRows] of passageMap) {
    const unique = uniqueQuestions(passageRows);

    if (unique.length >= count) {
      validPassages.push(key);
    }
  }

  if (validPassages.length === 0) {
    return null;
  }

  // Score passages by how many logical questions were recently used.
  const scored = validPassages.map((key) => {
    const unique = uniqueQuestions(
      passageMap.get(key) ?? [],
    );

    const recentlyUsed = unique.filter((q) =>
      recentSignatures.has(
        contentSignature(q),
      ),
    ).length;

    return {
      key,
      recentlyUsed,
    };
  });

  // Prefer passages with the fewest recently used questions.
  const minimumRecent = Math.min(
    ...scored.map((item) => item.recentlyUsed),
  );

  const candidates = scored
    .filter(
      (item) =>
        item.recentlyUsed === minimumRecent,
    )
    .map((item) => item.key);

  const passageKey = shuffle(candidates)[0];

  const passageRows = uniqueQuestions(
    passageMap.get(passageKey) ?? [],
  );

  // Prefer unseen questions.
  const fresh = passageRows.filter(
    (question) =>
      !recentSignatures.has(
        contentSignature(question),
      ),
  );

  const pool =
    fresh.length >= count
      ? fresh
      : passageRows;

  // Try to balance difficulty inside the passage.
  const chosen =
    chooseBalancedDifficulty(
      pool,
      count,
      new Set(),
    );

  if (chosen.length < count) {
    return null;
  }

  return {
    passageKey,
    questions: shuffle(chosen).slice(0, count),
  };
}

/**
 * Convert DB row to public API object.
 */
function serializeQuestion(
  question: QuestionRow,
) {
  const options = parseOptions(question.options);

  if (!options) {
    throw new Error(
      `Invalid options JSON for question ${question.id}`,
    );
  }

  return {
    id: question.id,
    category: question.category,
    difficulty: question.difficulty,
    difficultyLabel: difficultyLabel(
      question.difficulty,
    ),
    prompt: question.prompt,
    options,
    timeLimit: question.timeLimit,
    passageKey: question.passageKey,
    passageText: question.passageText,

    // Used by the current UI for instant feedback.
    correctIndex: question.correctIndex,

    // Question-specific explanation.
    explanation: question.explanation,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const category =
    searchParams.get("category");

  if (!isCategory(category)) {
    return NextResponse.json(
      {
        error: "Unknown category",
      },
      {
        status: 400,
      },
    );
  }

  const count =
    ROUND_SIZE[category];

  try {
    await ensureSeeded();
  } catch (error) {
    console.error(
      "Question seed error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Question bank is not ready yet.",
      },
      {
        status: 503,
      },
    );
  }

  try {
    // =========================================================
    // LOAD CATEGORY
    // =========================================================

    const bank = await db
      .select()
      .from(questionBank)
      .where(
        eq(
          questionBank.category,
          category,
        ),
      );

    const uniqueBank =
      uniqueQuestions(bank);

    if (uniqueBank.length < count) {
      return NextResponse.json(
        {
          error:
            `Only ${uniqueBank.length} unique questions are available for ${category}. Need ${count}.`,
        },
        {
          status: 503,
        },
      );
    }

    // =========================================================
    // RECENT USAGE
    // =========================================================

    const recentRows = await db
      .select({
        questionId:
          questionUsage.questionId,
      })
      .from(questionUsage)
      .where(
        eq(
          questionUsage.category,
          category,
        ),
      )
      .orderBy(
        desc(questionUsage.usedAt),
      )
      .limit(200);

    const recentIds = new Set(
      recentRows.map(
        (row) => row.questionId,
      ),
    );

    const recentQuestions =
      uniqueBank.filter(
        (question) =>
          question.id != null &&
          recentIds.has(question.id),
      );

    const recentSignatures =
      new Set(
        recentQuestions.map(
          contentSignature,
        ),
      );

    // =========================================================
    // READING / LISTENING
    // =========================================================

    if (
      category === "reading" ||
      category === "listening"
    ) {
      const round =
        choosePassageRound(
          uniqueBank,
          count,
          recentSignatures,
        );

      if (!round) {
        return NextResponse.json(
          {
            error:
              `Could not create a unique ${category} round.`,
          },
          {
            status: 503,
          },
        );
      }

      await db
        .insert(questionUsage)
        .values(
          round.questions.map(
            (question) => ({
              questionId: question.id!,
              category,
            }),
          ),
        );

      return NextResponse.json({
        category,
        questions:
          round.questions.map(
            serializeQuestion,
          ),
      });
    }

    // =========================================================
    // GRAMMAR / VERBAL / LOGICAL
    // =========================================================

    const chosen =
      chooseBalancedDifficulty(
        uniqueBank,
        count,
        recentSignatures,
      );

    if (chosen.length < count) {
      return NextResponse.json(
        {
          error:
            `Could not create a ${count}-question unique round for ${category}.`,
        },
        {
          status: 503,
        },
      );
    }

    // =========================================================
    // RECORD USAGE
    // =========================================================

    await db
      .insert(questionUsage)
      .values(
        chosen.map(
          (question) => ({
            questionId:
              question.id!,
            category,
          }),
        ),
      );

    // =========================================================
    // RESPONSE
    // =========================================================

    return NextResponse.json({
      category,
      questions:
        chosen.map(serializeQuestion),
    });
  } catch (error) {
    console.error(
      "Question API error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Failed to load questions.",
      },
      {
        status: 500,
      },
    );
  }
}