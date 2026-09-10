import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  answers,
  attempts,
  questionBank,
} from "@/db/schema";

import {
  isCategory,
  ratingFor,
  SECTION_LABEL,
  sendEmail,
} from "@/server/api-utils";

import {
  getSession,
} from "@/server/auth";

export const dynamic =
  "force-dynamic";

type ResultIn = {
  questionId: number;
  answer: number;
  timeTakenMs: number;
};

export async function POST(
  req: Request,
) {
  /*
   * ========================================================
   * AUTHENTICATION
   * ========================================================
   */

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
          "Please login before submitting a round.",
      },
      { status: 401 },
    );
  }

  /*
   * NEVER use body.userId.
   *
   * NEVER use body.email.
   *
   * These values can be forged by the browser.
   */
  const userId =
    session.userId;

  const userEmail =
    session.registration.email;

  let body: {
    userId?: string;
    category?: string;
    durationMs?: number;
    email?: string;
    results?: ResultIn[];
  };

  try {
    body =
      await req.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request body.",
      },
      { status: 400 },
    );
  }

  const category =
    body.category || "";

  if (
    !isCategory(
      category,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Unknown category.",
      },
      { status: 400 },
    );
  }

  const results =
    Array.isArray(
      body.results,
    )
      ? body.results
      : [];

  if (
    results.length === 0 ||
    results.length > 10
  ) {
    return NextResponse.json(
      {
        error:
          "A round must contain between 1 and 10 answers.",
      },
      { status: 400 },
    );
  }

  /*
   * Validate IDs.
   */
  const ids =
    results.map(
      (result) =>
        Number(
          result.questionId,
        ),
    );

  if (
    ids.some(
      (id) =>
        !Number.isInteger(id) ||
        id <= 0,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid question ID.",
      },
      { status: 400 },
    );
  }

  /*
   * Don't allow duplicate questions
   * in one submission.
   */
  if (
    new Set(ids).size !==
    ids.length
  ) {
    return NextResponse.json(
      {
        error:
          "Duplicate questions are not allowed.",
      },
      { status: 400 },
    );
  }

  /*
   * Load only the submitted questions.
   */
  const rows =
    await db
      .select()
      .from(questionBank)
      .where(
        inArray(
          questionBank.id,
          ids,
        ),
      );

  if (
    rows.length !==
    ids.length
  ) {
    return NextResponse.json(
      {
        error:
          "One or more questions are invalid.",
      },
      { status: 400 },
    );
  }

  const byId =
    new Map(
      rows.map(
        (row) => [
          row.id,
          row,
        ],
      ),
    );

  /*
   * Ensure every submitted question
   * belongs to the selected category.
   */
  for (const row of rows) {
    if (
      row.category !==
      category
    ) {
      return NextResponse.json(
        {
          error:
            "Question/category mismatch.",
        },
        { status: 400 },
      );
    }
  }

  /*
   * ========================================================
   * GRADING
   * ========================================================
   */

  let score = 0;

  let correct = 0;

  const graded =
    results.map(
      (result) => {
        const question =
          byId.get(
            Number(
              result.questionId,
            ),
          );

        if (!question) {
          throw new Error(
            "Question not found.",
          );
        }

        const answer =
          Number.isInteger(
            result.answer,
          )
            ? result.answer
            : -1;

        const timeTakenMs =
          Math.min(
            Math.max(
              0,
              Number(
                result.timeTakenMs,
              ) || 0,
            ),

            question.timeLimit *
              1000,
          );

        const isCorrect =
          answer ===
          question.correctIndex;

        if (isCorrect) {
          correct += 1;

          const secondsLeft =
            Math.max(
              0,

              (
                question.timeLimit *
                  1000 -
                timeTakenMs
              ) /
                1000,
            );

          const bonus =
            Math.min(
              10,
              Math.floor(
                secondsLeft *
                  2,
              ),
            );

          score +=
            20 + bonus;
        }

        return {
          q:
            question,

          answer,

          timeTakenMs,

          isCorrect,
        };
      },
    );

  const total =
    graded.length;

  const accuracy =
    Math.round(
      (correct /
        total) *
        100,
    );

  const rating =
    ratingFor(
      accuracy,
    );

  const durationMs =
    Math.max(
      0,
      Number(
        body.durationMs,
      ) || 0,
    );

  /*
   * ========================================================
   * SAVE ATTEMPT
   * ========================================================
   */

  const insertedAttempts =
    await db
      .insert(attempts)
      .values({
        /*
         * SECURITY:
         * Server session determines userId.
         */
        userId,

        category,

        score,

        correct,

        total,

        accuracy,

        durationMs,

        rating,
      })
      .returning({
        id:
          attempts.id,
      });

  const attempt =
    insertedAttempts[0];

  if (!attempt) {
    return NextResponse.json(
      {
        error:
          "Could not save the attempt.",
      },
      { status: 500 },
    );
  }

  /*
   * ========================================================
   * SAVE ANSWERS
   * ========================================================
   */

  await db
    .insert(answers)
    .values(
      graded.map(
        (item) => ({
          attemptId:
            attempt.id,

          /*
           * SECURITY:
           * Server session determines userId.
           */
          userId,

          questionId:
            item.q.id!,

          category:
            item.q.category,

          question:
            item.q.prompt,

          options:
            item.q.options,

          correctIndex:
            item.q.correctIndex,

          userAnswer:
            item.answer,

          isCorrect:
            item.isCorrect,

          timeTakenMs:
            item.timeTakenMs,
        }),
      ),
    );

  /*
   * ========================================================
   * SCORE EMAIL
   * ========================================================
   *
   * Recipient comes from the authenticated account.
   */
  let emailSent =
    false;

  let emailError:
    | string
    | null = null;

  try {
    await sendEmail(
      userEmail,

      "round_complete",

      "InterviewArena — round complete",

      [
        `Section: ${SECTION_LABEL[category]}`,

        "",

        `Score: ${score} points`,

        `Correct: ${correct}/${total}`,

        `Accuracy: ${accuracy}%`,

        `Rating: ${rating}`,

        "",

        "Keep practicing and improve your score!",

        "",

        "— InterviewArena",
      ].join("\n"),
    );

    emailSent =
      true;
  } catch (error) {
    console.error(
      "ROUND EMAIL ERROR:",
      error,
    );

    emailError =
      error instanceof Error
        ? error.message
        : "Score email could not be sent.";
  }

  /*
   * The round is already saved even
   * if SMTP fails.
   */
  return NextResponse.json({
    attempt: {
      id:
        attempt.id,

      score,

      correct,

      total,

      accuracy,

      durationMs,

      rating,

      emailSent,

      emailError,
    },

    results:
      graded.map(
        (item) => ({
          questionId:
            item.q.id,

          correct:
            item.isCorrect,

          correctIndex:
            item.q.correctIndex,

          explanation:
            item.q.explanation,
        }),
      ),
  });
}