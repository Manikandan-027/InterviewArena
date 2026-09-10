import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ML_SERVICE_URL =
  process.env.ML_SERVICE_URL || "http://127.0.0.1:8001";

type RequestBody = {
  userId?: string;
  transcript?: string;
  previousWeakAreas?: string[];
};

type Edit = {
  operation: string;
  original: string;
  corrected: string;
};

type MLAnalysis = {
  hasIssue: boolean;
  confidence: number;
  original: string;
  corrected: string;
  reason: string;
  weakArea: string;
  category:
    | "grammar"
    | "vocabulary"
    | "clarity"
    | "fluency"
    | "none";
  severity: "minor" | "important" | "major";
  edits: Edit[];
};

const EMPTY: MLAnalysis = {
  hasIssue: false,
  confidence: 0,
  original: "",
  corrected: "",
  reason: "",
  weakArea: "",
  category: "none",
  severity: "minor",
  edits: [],
};

function cleanAnalysis(value: unknown): MLAnalysis {
  if (!value || typeof value !== "object") {
    return EMPTY;
  }

  const input = value as Partial<MLAnalysis>;

  const confidence =
    typeof input.confidence === "number"
      ? Math.max(0, Math.min(1, input.confidence))
      : 0;

  const category =
    input.category === "grammar" ||
    input.category === "vocabulary" ||
    input.category === "clarity" ||
    input.category === "fluency"
      ? input.category
      : "none";

  const severity =
    input.severity === "minor" ||
    input.severity === "important" ||
    input.severity === "major"
      ? input.severity
      : "minor";

  const edits = Array.isArray(input.edits)
    ? input.edits
        .filter(
          (edit): edit is Edit =>
            !!edit &&
            typeof edit === "object" &&
            typeof (edit as Edit).operation === "string" &&
            typeof (edit as Edit).original === "string" &&
            typeof (edit as Edit).corrected === "string",
        )
        .slice(0, 10)
    : [];

  return {
    hasIssue: input.hasIssue === true,
    confidence,
    original:
      typeof input.original === "string"
        ? input.original.trim()
        : "",
    corrected:
      typeof input.corrected === "string"
        ? input.corrected.trim()
        : "",
    reason:
      typeof input.reason === "string"
        ? input.reason.trim()
        : "",
    weakArea:
      typeof input.weakArea === "string"
        ? input.weakArea.trim()
        : "",
    category,
    severity,
    edits,
  };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,!?;:"'()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfullyDifferent(
  original: string,
  corrected: string,
): boolean {
  return normalize(original) !== normalize(corrected);
}

function isSuspiciousCorrection(
  original: string,
  corrected: string,
): boolean {
  if (!original || !corrected) {
    return true;
  }

  if (!isMeaningfullyDifferent(original, corrected)) {
    return true;
  }

  const sourceWords = normalize(original).split(" ");
  const targetWords = normalize(corrected).split(" ");

  if (sourceWords.length === 0 || targetWords.length === 0) {
    return true;
  }

  /*
   * Reject extreme rewrites.
   *
   * A grammar correction should normally make a
   * relatively small change to what the candidate said.
   */
  const lengthRatio =
    targetWords.length / sourceWords.length;

  if (lengthRatio > 2.5 || lengthRatio < 0.4) {
    return true;
  }

  return false;
}

export async function POST(req: Request) {
  try {
    const body =
      (await req.json()) as RequestBody;

    const transcript =
      typeof body.transcript === "string"
        ? body.transcript.trim()
        : "";

    if (transcript.length < 8) {
      return NextResponse.json({
        analysis: EMPTY,
      });
    }

    if (transcript.length > 700) {
      return NextResponse.json({
        analysis: EMPTY,
      });
    }

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      15000,
    );

    try {
      const response = await fetch(
        `${ML_SERVICE_URL}/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transcript,
            userId: body.userId ?? null,
            previousWeakAreas:
              Array.isArray(body.previousWeakAreas)
                ? body.previousWeakAreas.slice(0, 10)
                : [],
          }),
          cache: "no-store",
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        console.error(
          "Speaking ML service returned:",
          response.status,
        );

        return NextResponse.json({
          analysis: EMPTY,
        });
      }

      const data =
        (await response.json()) as {
          analysis?: unknown;
        };

      const analysis =
        cleanAnalysis(data.analysis);

      /*
       * Safety gate:
       *
       * The GEC model is not allowed to accuse
       * the candidate unless it produced a genuine
       * correction with sufficient confidence.
       */
      if (
        !analysis.hasIssue ||
        analysis.confidence < 0.85 ||
        isSuspiciousCorrection(
          analysis.original,
          analysis.corrected,
        )
      ) {
        return NextResponse.json({
          analysis: EMPTY,
        });
      }

      return NextResponse.json({
        analysis,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error(
      "Speaking analysis proxy error:",
      error,
    );

    return NextResponse.json({
      analysis: EMPTY,
    });
  }
}