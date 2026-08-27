import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts } from "@/db/schema";
import { CATEGORIES, isCategory } from "@/server/api-utils";

export const dynamic = "force-dynamic";

type AttemptRow = (typeof attempts.$inferSelect)[];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || "";
  if (!userId || userId.length > 64) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const rows: AttemptRow = await db
    .select()
    .from(attempts)
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.completedAt));

  const xp = rows.reduce((s, r) => s + r.score, 0);
  const rounds = rows.length;
  const correctTotal = rows.reduce((s, r) => s + r.correct, 0);
  const totalTotal = rows.reduce((s, r) => s + r.total, 0);
  const accuracy = totalTotal ? Math.round((correctTotal / totalTotal) * 100) : 0;
  const bestScore = rows.reduce((m, r) => Math.max(m, r.score), 0);

  let streak = 0;
  for (const r of rows) {
    if (r.accuracy >= 60) streak += 1;
    else break;
  }

  const byCategory = CATEGORIES.map((cat) => {
    const rs = rows.filter((r) => r.category === cat);
    const c = rs.reduce((s, r) => s + r.correct, 0);
    const t = rs.reduce((s, r) => s + r.total, 0);
    return {
      category: cat,
      rounds: rs.length,
      correct: c,
      total: t,
      accuracy: t ? Math.round((c / t) * 100) : 0,
      bestScore: rs.reduce((m, r) => Math.max(m, r.score), 0),
      xp: rs.reduce((s, r) => s + r.score, 0),
      lastPlayedAt: rs[0]?.completedAt?.toISOString() ?? null,
    };
  });

  const badges = [
    {
      id: "first_round",
      label: "First Round",
      desc: "Complete your first round",
      earned: rounds >= 1,
    },
    {
      id: "sharpshooter",
      label: "Sharpshooter",
      desc: "Score 100% in a round",
      earned: rows.some((r) => r.accuracy === 100 && r.total >= 3),
    },
    {
      id: "all_sections",
      label: "Full Spectrum",
      desc: "Play every section at least once",
      earned: byCategory.every((c) => c.rounds >= 1),
    },
    {
      id: "consistency",
      label: "Consistency",
      desc: "3 rounds in a row at 60%+",
      earned: streak >= 3,
    },
    {
      id: "xp_500",
      label: "High Scorer",
      desc: "Reach 500 XP",
      earned: xp >= 500,
    },
    {
      id: "ten_rounds",
      label: "Regular",
      desc: "Complete 10 rounds",
      earned: rounds >= 10,
    },
  ];

  return NextResponse.json({
    totals: { xp, rounds, accuracy, correct: correctTotal, total: totalTotal, bestScore, streak },
    byCategory,
    recent: rows.slice(0, 8).map((r) => ({
      id: r.id,
      category: r.category,
      score: r.score,
      correct: r.correct,
      total: r.total,
      accuracy: r.accuracy,
      rating: r.rating,
      completedAt: r.completedAt.toISOString(),
    })),
    badges,
  });
}


