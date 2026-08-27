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
 * Email addresses registered for email alerts.
 */
export const registrations = pgTable("registrations", {
  id: serial("id").primaryKey(),

  name: text("name").notNull(),

  email: text("email").notNull().unique(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

/**
 * Full question bank.
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

    correctIndex: integer("correct_index").notNull(),

    explanation: text("explanation")
      .notNull()
      .default(""),

    timeLimit: integer("time_limit")
      .notNull()
      .default(40),
  },
  (t) => [
    index("qb_category_idx").on(t.category),
  ],
);

/**
 * Every question that has been served,
 * so new rounds never repeat recent ones.
 */
export const questionUsage = pgTable(
  "question_usage",
  {
    id: serial("id").primaryKey(),

    questionId: integer("question_id").notNull(),

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

    completedAt: timestamp("completed_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("att_user_idx").on(t.userId),

    index("att_cat_idx").on(t.category),
  ],
);

/**
 * Per-question answer log with a snapshot
 * of the question for the Missed notebook.
 */
export const answers = pgTable(
  "answers",
  {
    id: serial("id").primaryKey(),

    attemptId: integer("attempt_id").notNull(),

    userId: text("user_id"),

    questionId: integer("question_id").notNull(),

    category: text("category").notNull(),

    question: text("question").notNull(),

    options: text("options").notNull(),

    correctIndex: integer("correct_index").notNull(),

    // -1 = skipped / timed out
    userAnswer: integer("user_answer").notNull(),

    isCorrect: boolean("is_correct")
      .notNull()
      .default(false),

    timeTakenMs: integer("time_taken_ms")
      .notNull()
      .default(0),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("ans_user_idx").on(t.userId),

    index("ans_wrong_idx").on(
      t.userId,
      t.isCorrect,
    ),
  ],
);

/**
 * Email notifications.
 *
 * Every successful SMTP email is logged here.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),

    /**
     * Recipient email address.
     *
     * Example:
     * user@gmail.com
     */
    email: text("email").notNull(),

    /**
     * Notification channel.
     *
     * Currently only email is supported.
     */
    channel: text("channel")
      .notNull()
      .default("email"),

    /**
     * Notification type.
     *
     * Examples:
     * welcome
     * round_complete
     * test
     */
    event: text("event").notNull(),

    /**
     * Email subject.
     */
    title: text("title").notNull(),

    /**
     * Email message.
     */
    body: text("body").notNull(),

    /**
     * Email delivery status.
     *
     * Example:
     * sent
     * failed
     */
    status: text("status")
      .notNull()
      .default("sent"),

    /**
     * When the notification was created/sent.
     */
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("ntf_email_idx").on(t.email),
  ],
);