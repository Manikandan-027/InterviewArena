import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { attempts } from "@/db/schema";

import {
  CATEGORIES,
} from "@/server/api-utils";

import {
  getSession,
} from "@/server/auth";

export const dynamic =
  "force-dynamic";

type AttemptRow =
  (typeof attempts.$inferSelect)[];

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
          "Please login to view your statistics.",
      },
      { status: 401 },
    );
  }

  /*
   * IMPORTANT:
   *
   * userId comes ONLY from the
   * authenticated server session.
   */
  const userId =
    session.userId;

  const rows: AttemptRow =
    await db
      .select()
      .from(attempts)
      .where(
        eq(
          attempts.userId,
          userId,
        ),
      )
      .orderBy(
        desc(
          attempts.completedAt,
        ),
      );

  const xp =
    rows.reduce(
      (sum, row) =>
        sum + row.score,
      0,
    );

  const rounds =
    rows.length;

  const correctTotal =
    rows.reduce(
      (sum, row) =>
        sum + row.correct,
      0,
    );

  const totalTotal =
    rows.reduce(
      (sum, row) =>
        sum + row.total,
      0,
    );

  const accuracy =
    totalTotal > 0
      ? Math.round(
          (correctTotal /
            totalTotal) *
            100,
        )
      : 0;

  const bestScore =
    rows.reduce(
      (max, row) =>
        Math.max(
          max,
          row.score,
        ),
      0,
    );

  let streak = 0;

  for (const row of rows) {
    if (
      row.accuracy >= 60
    ) {
      streak += 1;
    } else {
      break;
    }
  }

  const byCategory =
    CATEGORIES.map(
      (category) => {
        const categoryRows =
          rows.filter(
            (row) =>
              row.category ===
              category,
          );

        const correct =
          categoryRows.reduce(
            (sum, row) =>
              sum + row.correct,
            0,
          );

        const total =
          categoryRows.reduce(
            (sum, row) =>
              sum + row.total,
            0,
          );

        return {
          category,

          rounds:
            categoryRows.length,

          correct,

          total,

          accuracy:
            total > 0
              ? Math.round(
                  (correct /
                    total) *
                    100,
                )
              : 0,

          bestScore:
            categoryRows.reduce(
              (max, row) =>
                Math.max(
                  max,
                  row.score,
                ),
              0,
            ),

          xp:
            categoryRows.reduce(
              (sum, row) =>
                sum + row.score,
              0,
            ),

          lastPlayedAt:
            categoryRows[0]
              ?.completedAt
              ?.toISOString() ??
            null,
        };
      },
    );

  const badges = [
    {
      id: "first_round",
      label: "First Round",
      desc: "Complete your first round",
      earned:
        rounds >= 1,
    },

    {
      id: "sharpshooter",
      label: "Sharpshooter",
      desc: "Score 100% in a round",
      earned:
        rows.some(
          (row) =>
            row.accuracy ===
              100 &&
            row.total >= 3,
        ),
    },

    {
      id: "all_sections",
      label: "Full Spectrum",
      desc: "Play every section at least once",
      earned:
        byCategory.every(
          (category) =>
            category.rounds >=
            1,
        ),
    },

    {
      id: "consistency",
      label: "Consistency",
      desc: "3 rounds in a row at 60%+",
      earned:
        streak >= 3,
    },

    {
      id: "xp_500",
      label: "High Scorer",
      desc: "Reach 500 XP",
      earned:
        xp >= 500,
    },

    {
      id: "ten_rounds",
      label: "Regular",
      desc: "Complete 10 rounds",
      earned:
        rounds >= 10,
    },
  ];

  return NextResponse.json(
    {
      totals: {
        xp,
        rounds,
        accuracy,
        correct:
          correctTotal,
        total:
          totalTotal,
        bestScore,
        streak,
      },

      byCategory,

      recent:
        rows
          .slice(0, 8)
          .map(
            (row) => ({
              id:
                row.id,

              category:
                row.category,

              score:
                row.score,

              correct:
                row.correct,

              total:
                row.total,

              accuracy:
                row.accuracy,

              rating:
                row.rating,

              completedAt:
                row.completedAt.toISOString(),
            }),
          ),

      badges,
    },

    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}