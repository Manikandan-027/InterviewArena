import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Registered InterviewArena users.
 *
 * passwordHash is nullable only because existing databases
 * may contain old email-only registrations.
 *
 * New accounts always have a passwordHash.
 */
export const registrations = pgTable("registrations", {
  id: serial("id").primaryKey(),

  name: text("name").notNull(),

  email: text("email").notNull().unique(),

  passwordHash: text("password_hash"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

/**
 * Secure server-side authentication sessions.
 *
 * The browser only receives the random session ID
 * through an HttpOnly cookie.
 *
 * userId is controlled by the server.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),

    userId: text("user_id").notNull(),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("auth_session_user_idx").on(
      t.userId,
    ),

    index("auth_session_exp_idx").on(
      t.expiresAt,
    ),
  ],
);

/**
 * Full question bank.
 *
 * Options are stored as a JSON array of strings.
 */
export const questionBank = pgTable(
  "question_bank",
  {
    id: serial("id").primaryKey(),

    category: text("category").notNull(),

    difficulty: integer("difficulty")
      .notNull()
      .default(1),

    passageKey: text("passage_key"),

    passageText: text("passage_text"),

    prompt: text("prompt").notNull(),

    options: text("options").notNull(),

    correctIndex: integer(
      "correct_index",
    ).notNull(),

    explanation: text("explanation")
      .notNull()
      .default(""),

    timeLimit: integer("time_limit")
      .notNull()
      .default(40),
  },
  (t) => [
    index("qb_category_idx").on(
      t.category,
    ),
  ],
);

/**
 * Every question that has been served.
 */
export const questionUsage = pgTable(
  "question_usage",
  {
    id: serial("id").primaryKey(),

    questionId: integer(
      "question_id",
    ).notNull(),

    category: text("category").notNull(),

    usedAt: timestamp("used_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("qu_cat_used_idx").on(
      t.category,
      t.usedAt,
    ),
  ],
);

/**
 * One completed practice round.
 */
export const attempts = pgTable(
  "attempts",
  {
    id: serial("id").primaryKey(),

    userId: text("user_id").notNull(),

    category: text("category").notNull(),

    score: integer("score")
      .notNull()
      .default(0),

    correct: integer("correct")
      .notNull()
      .default(0),

    total: integer("total")
      .notNull()
      .default(0),

    accuracy: integer("accuracy")
      .notNull()
      .default(0),

    durationMs: integer("duration_ms")
      .notNull()
      .default(0),

    rating: text("rating"),

    completedAt: timestamp(
      "completed_at",
      {
        withTimezone: true,
      },
    )
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("att_user_idx").on(
      t.userId,
    ),

    index("att_cat_idx").on(
      t.category,
    ),
  ],
);

/**
 * Per-question answer log.
 */
export const answers = pgTable(
  "answers",
  {
    id: serial("id").primaryKey(),

    attemptId: integer(
      "attempt_id",
    ).notNull(),

    userId: text("user_id"),

    questionId: integer(
      "question_id",
    ).notNull(),

    category: text("category").notNull(),

    question: text("question").notNull(),

    options: text("options").notNull(),

    correctIndex: integer(
      "correct_index",
    ).notNull(),

    // -1 = skipped / timed out
    userAnswer: integer(
      "user_answer",
    ).notNull(),

    isCorrect: boolean(
      "is_correct",
    )
      .notNull()
      .default(false),

    timeTakenMs: integer(
      "time_taken_ms",
    )
      .notNull()
      .default(0),

    createdAt: timestamp(
      "created_at",
      {
        withTimezone: true,
      },
    )
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("ans_user_idx").on(
      t.userId,
    ),

    index("ans_wrong_idx").on(
      t.userId,
      t.isCorrect,
    ),
  ],
);

/**
 * Email notifications.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),

    email: text("email").notNull(),

    channel: text("channel")
      .notNull()
      .default("email"),

    event: text("event").notNull(),

    title: text("title").notNull(),

    body: text("body").notNull(),

    status: text("status")
      .notNull()
      .default("sent"),

    createdAt: timestamp(
      "created_at",
      {
        withTimezone: true,
      },
    )
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("ntf_email_idx").on(
      t.email,
    ),
  ],
);