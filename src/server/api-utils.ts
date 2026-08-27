import { db } from "@/db";
import { notifications } from "@/db/schema";

export const CATEGORIES = [
  "grammar",
  "verbal",
  "logical",
  "reading",
  "listening",
] as const;

export type CategoryKey = (typeof CATEGORIES)[number];

export function isCategory(v: string | null): v is CategoryKey {
  return !!v && (CATEGORIES as readonly string[]).includes(v);
}

export function cleanEmail(v: string): string {
  return (v || "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(email));
}

export function maskEmail(email: string): string {
  const value = cleanEmail(email);
  const [local, domain] = value.split("@");

  if (!local || !domain) {
    return value;
  }

  if (local.length <= 2) {
    return `${local[0] || ""}•@${domain}`;
  }

  return `${local.slice(0, 2)}${"•".repeat(
    Math.max(1, local.length - 2),
  )}@${domain}`;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

/**
 * Sends a real email through SMTP
 * and records the successful notification in PostgreSQL.
 */
export async function sendEmail(
  email: string,
  event: string,
  title: string,
  body: string,
): Promise<void> {
  const recipient = cleanEmail(email);

  if (!isValidEmail(recipient)) {
    throw new Error("Invalid recipient email address.");
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  const secure =
    (process.env.SMTP_SECURE || "true").toLowerCase() === "true";

  if (!host || !user || !pass || !from) {
    throw new Error(
      "SMTP is not configured. Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and SMTP_FROM in .env.local.",
    );
  }

  if (pass === "your_google_app_password") {
    throw new Error(
      "SMTP_PASS still contains the placeholder. Use your real Google App Password.",
    );
  }

  const nodemailer = await import("nodemailer");

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  try {
    await transporter.sendMail({
      from,
      to: recipient,
      subject: title,
      text: body,
      html: `
        <div
          style="
            font-family: Arial, sans-serif;
            max-width: 650px;
            margin: auto;
            line-height: 1.6;
          "
        >
          <h2>${escapeHtml(title)}</h2>

          <p>
            ${escapeHtml(body).replace(/\n/g, "<br />")}
          </p>

          <hr />

          <p style="color:#777;font-size:12px">
            InterviewArena — Practice smarter.
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("SMTP SEND ERROR:", error);

    if (error instanceof Error) {
      throw new Error(`Email could not be sent: ${error.message}`);
    }

    throw new Error("Email could not be sent.");
  }

  await db.insert(notifications).values({
    email: recipient,
    channel: "email",
    event,
    title,
    body,
    status: "sent",
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function ratingFor(accuracy: number): string {
  if (accuracy >= 90) {
    return "Outstanding";
  }

  if (accuracy >= 70) {
    return "Strong";
  }

  if (accuracy >= 50) {
    return "Getting there";
  }

  return "Needs practice";
}

export const SECTION_LABEL: Record<CategoryKey, string> = {
  grammar: "Grammar",
  verbal: "Verbal & Vocabulary",
  logical: "Logical Reasoning",
  reading: "Reading Comprehension",
  listening: "Listening Comprehension",
};