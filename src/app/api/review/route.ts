import { NextResponse } from "next/server";
import {
  and,
  desc,
  eq,
} from "drizzle-orm";

import { db } from "@/db";
import { answers } from "@/db/schema";

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
          "Please login to view your review history.",
      },
      { status: 401 },
    );
  }

  const rows =
    await db
      .select()
      .from(answers)
      .where(
        and(
          eq(
            answers.userId,
            session.userId,
          ),

          eq(
            answers.isCorrect,
            false,
          ),
        ),
      )
      .orderBy(
        desc(
          answers.createdAt,
        ),
      )
      .limit(12);

  return NextResponse.json({
    missed:
      rows.map(
        (row) => ({
          id:
            row.id,

          category:
            row.category,

          question:
            row.question,

          options:
            JSON.parse(
              row.options,
            ) as string[],

          correctIndex:
            row.correctIndex,

          userAnswer:
            row.userAnswer,

          createdAt:
            row.createdAt.toISOString(),
        }),
      ),
  });
}