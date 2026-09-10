import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROXY_AUDIO_BYTES = 14.5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const mlServiceUrl = process.env.ML_SERVICE_URL?.trim();

  if (!mlServiceUrl) {
    return NextResponse.json(
      { error: "ML_SERVICE_URL is not configured. Add it to .env.local and restart Next.js." },
      { status: 500 },
    );
  }

  try {
    const incoming = await request.formData();
    const audio = incoming.get("audio");
    const userId = String(incoming.get("userId") ?? "").trim();
    const previousWeakAreas = String(incoming.get("previousWeakAreas") ?? "").trim();
    const question = String(incoming.get("question") ?? "").trim();

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
    }

    if (audio.size <= 0) {
      return NextResponse.json({ error: "The recorded audio is empty." }, { status: 400 });
    }

    if (audio.size > MAX_PROXY_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "The recording is too large. Please keep a session below about 14.5 MB." },
        { status: 413 },
      );
    }

    const form = new FormData();
    form.append("audio", audio, audio.name || "speech.webm");
    if (userId) form.append("userId", userId);
    if (previousWeakAreas) form.append("previousWeakAreas", previousWeakAreas);
    if (question) form.append("question", question.slice(0, 1000));

    const baseUrl = mlServiceUrl.replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/analyze-audio`, {
        method: "POST",
        body: form,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      const code = error instanceof Error && "cause" in error
        ? String((error as Error & { cause?: { code?: string } }).cause?.code ?? "")
        : "";

      if (error instanceof Error && error.name === "AbortError") {
        return NextResponse.json(
          { error: "Speaking ML analysis timed out. The local ML service may still be processing the audio." },
          { status: 504 },
        );
      }

      if (code === "ECONNREFUSED") {
        return NextResponse.json(
          {
            error:
              `Speaking ML service is not running at ${baseUrl}. Start the FastAPI service on port 8001, then try again.`,
          },
          { status: 503 },
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let data: unknown;

    try {
      data = text ? JSON.parse(text) : { error: "ML service returned an empty response." };
    } catch {
      data = { error: text || "ML service returned an invalid response." };
    }

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Speaking ML proxy error:", error);
    return NextResponse.json(
      { error: "Unable to connect to the speaking ML service. Check that FastAPI is running and ML_SERVICE_URL is correct." },
      { status: 502 },
    );
  }
}
