"use client";

import * as React from "react";

interface SpeakingCoachProps {
  userId: string;
}

type Status = "idle" | "starting" | "listening" | "processing" | "error";

type Edit = {
  operation?: string;
  original?: string;
  corrected?: string;
};

type Analysis = {
  hasIssue: boolean;
  confidence: number;
  original: string;
  corrected: string;
  reason: string;
  weakArea: string;
  category: string;
  severity: string;
  edits?: Edit[];
  issueCount?: number;
  allIssues?: Array<{
    original?: string;
    corrected?: string;
    reason?: string;
    weakArea?: string;
    category?: string;
    severity?: string;
    confidence?: number;
    edits?: Edit[];
  }>;
};

type Communication = {
  scores?: {
    grammar?: number;
    meaning?: number;
    coherence?: number;
    vocabulary?: number;
    clarity?: number;
    fluency?: number;
    asrConfidence?: number;
    overallCommunication?: number;
    relevance?: number | null;
    structure?: number | null;
    delivery?: number;
    pronunciationProxy?: number;
  };
  message?: string;
  meaning?: {
    status?: string;
    explanation?: string;
  };
  feedback?: string[];
  weakAreas?: string[];
  recommendations?: { area?: string; task?: string }[];
  relevance?: {
    available?: boolean;
    score?: number | null;
    intent?: string;
    matchedKeywords?: string[];
    missingKeywords?: string[];
    explanation?: string;
  };
  sentenceMeaning?: {
    score?: number;
    status?: string;
    explanation?: string;
  }[];
  speechMetrics?: {
    speakingRateWpm?: number;
    speechTimeSeconds?: number;
    pauseCount?: number;
    longPauseCount?: number;
    longestPauseSeconds?: number;
    fillerCount?: number;
    fillers?: string[];
    repeatedWordCount?: number;
    wordConfidence?: number;
    pronunciationProxy?: number;
    deliveryScore?: number;
  };
  adaptivePractice?: { area?: string; task?: string }[];
  structure?: {
    available?: boolean;
    score?: number | null;
    covered?: string[];
    missing?: string[];
    explanation?: string;
  };
};

type MLResponse = {
  transcript?: string;
  tenseAnalysis?: {
    counts?: Record<string, number>;
    sentences?: Array<{ sentence?: string; dominant?: string; cues?: string[]; inheritedPast?: boolean }>;
  };
  analysis?: Analysis;
  analyses?: Analysis[];
  weakAreas?: string[];
  communication?: Communication;
  stats?: {
    words?: number;
    sentences?: number;
    mistakes?: number;
    accuracy?: number;
    grammarScore?: number;
    meaningScore?: number;
    coherenceScore?: number;
    vocabularyScore?: number;
    clarityScore?: number;
    fluencyScore?: number;
    deliveryScore?: number;
    pronunciationProxy?: number;
    structureScore?: number | null;
    communicationScore?: number;
    confidence?: number;
    durationSeconds?: number;
  };
  detail?: string;
  error?: string;
};

function words(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function percent(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}

function label(value: string) {
  if (!value) return "General";
  return value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function scoreTone(value: number | undefined) {
  if (typeof value !== "number") return "text-mute";
  if (value >= 85) return "text-mint";
  if (value >= 70) return "text-gold";
  return "text-rose";
}

export default function SpeakingCoach({ userId }: SpeakingCoachProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [transcript, setTranscript] = React.useState("");
  const [analyses, setAnalyses] = React.useState<Analysis[]>([]);
  const [weakAreas, setWeakAreas] = React.useState<string[]>([]);
  const [stats, setStats] = React.useState<MLResponse["stats"]>({});
  const [communication, setCommunication] = React.useState<Communication>({});
  const [error, setError] = React.useState("");
  const [elapsed, setElapsed] = React.useState(0);
  const [trackedWeakAreas, setTrackedWeakAreas] = React.useState<string[]>([]);
  const [question, setQuestion] = React.useState("");
  const [history, setHistory] = React.useState<Array<{ date: string; score: number; grammar: number; relevance?: number | null }>>([]);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const sessionIdRef = React.useRef(0);
  const intentionalStopRef = React.useRef(false);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`ia_speaking_weak_areas_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setTrackedWeakAreas(parsed);
      }
      const savedHistory = window.localStorage.getItem(`ia_speaking_history_${userId}`);
      if (savedHistory) {
        const parsedHistory = JSON.parse(savedHistory);
        if (Array.isArray(parsedHistory)) setHistory(parsedHistory.slice(-8));
      }
    } catch {}
  }, [userId]);

  React.useEffect(() => {
    if (status !== "listening") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  React.useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      intentionalStopRef.current = false;
      try {
        if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
      } catch {}
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const resetResult = () => {
    setTranscript("");
    setAnalyses([]);
    setWeakAreas([]);
    setStats({});
    setCommunication({});
    setError("");
    setElapsed(0);
  };

  const rememberWeakAreas = (areas: string[]) => {
    const merged = Array.from(new Set([...trackedWeakAreas, ...areas])).slice(-12);
    setTrackedWeakAreas(merged);
    try {
      window.localStorage.setItem(`ia_speaking_weak_areas_${userId}`, JSON.stringify(merged));
    } catch {}
  };

  const analyzeAudio = async (blob: Blob, currentSession: number) => {
    try {
      if (blob.size < 1000) throw new Error("The recording is empty. Please speak for a little longer.");
      if (blob.size > 14.5 * 1024 * 1024) {
        throw new Error("This recording is larger than the 15 MB ML-service limit. Please make the next session shorter.");
      }

      const extension = blob.type.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.append("audio", new File([blob], `speaking-session.${extension}`, { type: blob.type || "audio/webm" }));
      form.append("userId", userId);
      form.append("previousWeakAreas", JSON.stringify(trackedWeakAreas));
      if (question.trim()) form.append("question", question.trim());

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 180000);

      let response: Response;
      try {
        response = await fetch("/api/speaking/analyze-audio", {
          method: "POST",
          body: form,
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }

      let data: MLResponse = {};
      try {
        data = await response.json();
      } catch {
        throw new Error(`ML service returned an invalid response (${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(data.detail || data.error || `Speaking analysis failed (${response.status}).`);
      }

      if (currentSession !== sessionIdRef.current) return;

      const nextTranscript = data.transcript?.trim() || "";
      const allAnalyses = Array.isArray(data.analyses)
        ? data.analyses.filter((item) => item?.hasIssue)
        : data.analysis?.hasIssue
          ? [data.analysis]
          : [];
      const nextCommunication = data.communication || {};
      const nextWeakAreas = Array.isArray(data.weakAreas)
        ? data.weakAreas
        : nextCommunication.weakAreas || [];

      setTranscript(nextTranscript);
      setAnalyses(allAnalyses);
      setWeakAreas(nextWeakAreas);
      setCommunication(nextCommunication);
      setStats(data.stats || { words: words(nextTranscript), mistakes: allAnalyses.length });
      setTenseAnalysis(data.tenseAnalysis);
      rememberWeakAreas(nextWeakAreas);
      const score = Number(nextCommunication.scores?.overallCommunication ?? data.stats?.communicationScore ?? 0);
      if (Number.isFinite(score) && nextTranscript) {
        const entry = {
          date: new Date().toISOString(),
          score: Math.round(score),
          grammar: Math.round(Number(nextCommunication.scores?.grammar ?? data.stats?.grammarScore ?? 0)),
          relevance: nextCommunication.scores?.relevance ?? null,
        };
        const nextHistory = [...history, entry].slice(-8);
        setHistory(nextHistory);
        try { window.localStorage.setItem(`ia_speaking_history_${userId}`, JSON.stringify(nextHistory)); } catch {}
      }
      setStatus("idle");
    } catch (err) {
      if (currentSession !== sessionIdRef.current) return;
      const message = err instanceof DOMException && err.name === "AbortError"
        ? "Analysis took too long. The recording was stopped safely; please try a shorter session."
        : err instanceof Error
          ? err.message
          : "Unable to analyze the recording.";
      setError(message);
      setStatus("error");
    }
  };

  const start = async () => {
    if (status === "listening" || status === "starting" || status === "processing") return;

    resetResult();
    setStatus("starting");
    const currentSession = ++sessionIdRef.current;
    intentionalStopRef.current = false;

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("This browser does not support microphone recording.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      if (currentSession !== sessionIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        intentionalStopRef.current = false;
        setError("The microphone recorder reported an error.");
        setStatus("error");
      };

      recorder.onstop = () => {
        const shouldAnalyze = intentionalStopRef.current;
        intentionalStopRef.current = false;
        const finalBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });

        chunksRef.current = [];
        recorderRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        if (shouldAnalyze) void analyzeAudio(finalBlob, currentSession);
      };

      // ONE continuous recording. There is no timer-based stop and no chunk restart.
      recorder.start();
      setStatus("listening");
    } catch (err) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setError(err instanceof Error ? err.message : "Microphone access failed.");
      setStatus("error");
    }
  };

  const finish = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    intentionalStopRef.current = true;
    setStatus("processing");
    recorder.stop();
  };

  const clear = () => {
    if (status === "listening" || status === "starting" || status === "processing") return;
    resetResult();
    setStatus("idle");
  };

  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const scores = communication.scores || {};
  const overall = scores.overallCommunication;

  return (
    <section className="space-y-5 text-cream">
      <div className="overflow-hidden rounded-2xl border border-line bg-panel p-5 shadow-[0_20px_70px_rgba(0,0,0,0.25)]">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-mint/20 bg-mint/10 text-2xl">🎙️</div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-mint">InterviewArena ML</p>
              <h2 className="mt-1 font-display text-2xl font-bold text-cream">Speaking Coach</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-mute">
                Local speech recognition + grammar + meaning + interview + delivery analysis.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
              status === "listening" ? "border-mint/30 bg-mint/10 text-mint" :
              status === "processing" ? "border-gold/30 bg-gold/10 text-gold" :
              status === "error" ? "border-rose/30 bg-rose/10 text-rose" :
              "border-line bg-panel2 text-mute"
            }`}>
              {status === "listening" ? "● Recording" : status === "processing" ? "Analyzing" : status === "starting" ? "Starting" : status === "error" ? "Error" : "Ready"}
            </span>
            {status === "listening" && <span className="font-mono text-sm font-bold text-mint">{duration}</span>}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-panel2 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
            <span className="rounded-full bg-mint/10 px-2.5 py-1 font-semibold text-mint">Continuous recording</span>
            <span>→</span><span className="rounded-full bg-panel px-2.5 py-1">Finish Session</span>
            <span>→</span><span className="rounded-full bg-panel px-2.5 py-1">Whisper</span>
            <span>→</span><span className="rounded-full bg-panel px-2.5 py-1">Grammar</span>
            <span>→</span><span className="rounded-full bg-panel px-2.5 py-1">Meaning</span>
            <span>→</span><span className="rounded-full bg-panel px-2.5 py-1">Communication</span>
          </div>
          <p className="mt-3 text-xs leading-6 text-mute">
            The recorder never stops because of a timer or silence. You decide when the answer is finished.
            The recording stays continuous. Analysis starts only after Finish Session so the complete answer can be evaluated together.
          </p>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-panel2 p-4">
          <label htmlFor="speaking-question" className="text-sm font-bold text-cream">Interview question <span className="font-normal text-mute">(optional)</span></label>
          <textarea
            id="speaking-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={status === "listening" || status === "processing"}
            placeholder="Example: Explain your final-year project and your role in it."
            className="mt-2 min-h-20 w-full resize-y rounded-xl border border-line bg-panel px-3 py-2 text-sm leading-6 text-cream outline-none placeholder:text-mute focus:border-mint/50"
          />
          <p className="mt-2 text-xs leading-5 text-mute">Add the question to evaluate answer relevance and interview intent. Leave it empty for general communication practice.</p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {status === "listening" ? (
            <button onClick={finish} className="rounded-xl bg-rose px-5 py-3 text-xs font-bold text-white transition hover:opacity-90">⏹ Finish Session</button>
          ) : (
            <button onClick={start} disabled={status === "processing"} className="rounded-xl bg-mint px-5 py-3 text-xs font-bold text-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">🎙 Start New Session</button>
          )}
          <button onClick={clear} disabled={status === "listening" || status === "starting" || status === "processing"} className="rounded-xl border border-line bg-panel2 px-5 py-3 text-xs font-bold text-cream transition hover:border-mint/30 disabled:cursor-not-allowed disabled:opacity-40">Clear</button>
        </div>

        {status === "processing" && (
          <div className="mt-5 rounded-xl border border-gold/20 bg-gold/5 p-4">
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
              <div>
                <p className="text-sm font-bold text-gold">Analyzing complete session...</p>
                <p className="mt-1 text-xs text-mute">Whisper → grammar → meaning → coherence → vocabulary → communication.</p>
              </div>
            </div>
          </div>
        )}
        {error && <div className="mt-5 rounded-xl border border-rose/20 bg-rose/5 p-4 text-sm leading-6 text-rose">{error}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ScoreCard title="Communication" value={percent(overall)} tone={scoreTone(overall)} />
        <ScoreCard title="Meaning" value={percent(scores.meaning)} tone={scoreTone(scores.meaning)} />
        <ScoreCard title="Grammar" value={percent(scores.grammar)} tone={scoreTone(scores.grammar)} />
        <ScoreCard title="Clarity" value={percent(scores.clarity)} tone={scoreTone(scores.clarity)} />
      </div>

      <div className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Communication Breakdown</p>
          <span className="text-[10px] text-mute">Coaching scores, not model accuracy</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <MiniScore title="Grammar" value={scores.grammar} />
          <MiniScore title="Meaning" value={scores.meaning} />
          <MiniScore title="Coherence" value={scores.coherence} />
          <MiniScore title="Vocabulary" value={scores.vocabulary} />
          <MiniScore title="Fluency" value={scores.fluency} />
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-mute">What You Were Trying To Communicate</p>
        <div className="mt-3 rounded-xl border border-line bg-panel2 p-4">
          {communication.message ? (
            <p className="text-sm leading-7 text-cream">{communication.message}</p>
          ) : (
            <p className="text-sm leading-7 text-mute">Finish a session to see the cleaned expression of your spoken message.</p>
          )}
        </div>
        {communication.meaning?.status && (
          <div className="mt-3 rounded-xl border border-mint/15 bg-mint/5 p-4">
            <p className="text-xs font-bold text-mint">{communication.meaning.status}</p>
            <p className="mt-1 text-sm leading-6 text-mute">{communication.meaning.explanation}</p>
          </div>
        )}
      </div>

      {communication.relevance?.available && (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-mint">Interview Answer Relevance</p>
              <p className="mt-1 text-xs text-mute">Intent: {label(communication.relevance.intent || "general interview answer")}</p>
            </div>
            <span className={`font-display text-xl font-bold ${scoreTone(communication.relevance.score ?? undefined)}`}>{percent(communication.relevance.score ?? undefined)}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-mute">{communication.relevance.explanation}</p>
          {!!communication.relevance.matchedKeywords?.length && <p className="mt-2 text-xs text-mint">Covered: {communication.relevance.matchedKeywords.join(", ")}</p>}
          {!!communication.relevance.missingKeywords?.length && <p className="mt-2 text-xs text-gold">Consider addressing: {communication.relevance.missingKeywords.join(", ")}</p>}
        </section>
      )}

      <div className="rounded-2xl border border-mint/20 bg-panel p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-mint">Final Corrected Expression</p>
          <span className="text-[10px] text-mute">Same meaning, corrected grammar</span>
        </div>
        <div className="mt-3 rounded-xl border border-mint/15 bg-mint/5 p-4">
          {communication.message ? (
            <p className="whitespace-pre-wrap text-sm leading-7 text-cream">{communication.message}</p>
          ) : (
            <p className="text-sm leading-7 text-mute">Finish a session to see your complete corrected answer or paragraph.</p>
          )}
        </div>
        {communication.message && (
          <p className="mt-3 text-xs leading-6 text-mute">This is the final corrected version of your complete response. It keeps your original ideas and only applies confirmed corrections.</p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Session Transcript</p>
          <span className="text-[10px] text-mute">{words(transcript)} words</span>
        </div>
        <div className="mt-3 min-h-[150px] rounded-xl border border-line bg-panel2 p-4">
          {transcript ? <p className="whitespace-pre-wrap text-sm leading-7 text-cream">{transcript}</p> : <p className="text-sm leading-7 text-mute">Your complete speech transcript will appear here after Finish Session.</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat title="Words" value={String(stats?.words ?? words(transcript))} />
        <Stat title="Sentences" value={String(stats?.sentences ?? "--")} />
        <Stat title="Grammar Errors" value={String(stats?.mistakes ?? analyses.length)} />
        <Stat title="ASR Confidence" value={percent(stats?.confidence)} />
      </div>

      {tenseAnalysis?.counts && (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-mint">Tense Analysis</p>
          <p className="mt-1 text-xs text-mute">Sentence-level tense classification using time cues and grammatical patterns.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {Object.entries(tenseAnalysis.counts).map(([name, count]) => (
              <Stat key={name} title={label(name)} value={String(count)} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <MiniScore title="Speech delivery" value={communication.scores?.delivery} />
        <MiniScore title="Answer structure" value={communication.scores?.structure ?? undefined} />
        <MiniScore title="Recognition proxy" value={communication.scores?.pronunciationProxy} />
        <MiniScore title="Relevance" value={communication.scores?.relevance ?? undefined} />
      </div>

      {communication.speechMetrics && (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-mint">Advanced Speech Analysis</p>
              <p className="mt-1 text-xs text-mute">Delivery metrics from Whisper word timestamps.</p>
            </div>
            <span className="text-[10px] text-mute">Pronunciation is a recognition-confidence proxy, not phoneme scoring.</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat title="Speaking Rate" value={`${Math.round(communication.speechMetrics.speakingRateWpm ?? 0)} WPM`} />
            <Stat title="Pauses" value={String(communication.speechMetrics.pauseCount ?? 0)} />
            <Stat title="Long Pauses" value={String(communication.speechMetrics.longPauseCount ?? 0)} />
            <Stat title="Fillers" value={String(communication.speechMetrics.fillerCount ?? 0)} />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel2 p-3 text-sm text-mute">
              Longest pause: <span className="font-semibold text-cream">{(communication.speechMetrics.longestPauseSeconds ?? 0).toFixed(1)}s</span>
            </div>
            <div className="rounded-xl border border-line bg-panel2 p-3 text-sm text-mute">
              Repeated words: <span className="font-semibold text-cream">{communication.speechMetrics.repeatedWordCount ?? 0}</span>
            </div>
          </div>
          {!!communication.speechMetrics.fillers?.length && (
            <p className="mt-3 text-xs leading-5 text-mute">Filler terms: {communication.speechMetrics.fillers.join(", ")}</p>
          )}
        </section>
      )}

      {communication.structure?.available && (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-mint">Interview Answer Structure</p>
          <p className="mt-2 text-sm leading-6 text-mute">{communication.structure.explanation}</p>
          {!!communication.structure.covered?.length && <p className="mt-2 text-xs text-mint">Covered: {communication.structure.covered.join(", ")}</p>}
          {!!communication.structure.missing?.length && <p className="mt-2 text-xs text-gold">Add: {communication.structure.missing.join(", ")}</p>}
        </section>
      )}

      <div className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Grammar Feedback</p>
          <span className="text-[10px] font-semibold text-mint">{analyses.length} confirmed</span>
        </div>
        {analyses.length === 0 ? (
          <div className="mt-4 rounded-xl border border-line bg-panel2 p-5 text-sm leading-6 text-mute">No confirmed grammar issues from this session.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {analyses.map((item, index) => (
              <div key={`${item.original}-${index}`} className="rounded-xl border border-line bg-panel2 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div><p className="text-[10px] font-bold uppercase text-rose">You said</p><p className="mt-1 text-sm leading-6 text-cream">{item.original}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-mint">Better version</p><p className="mt-1 text-sm leading-6 text-cream">{item.corrected}</p></div>
                </div>
                {(() => {
                  const corrections = item.allIssues?.length ? item.allIssues : [item];
                  const exactEdits = corrections.flatMap((issue) => issue.edits || []);
                  return exactEdits.length ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Exact corrections</p>
                      {exactEdits.map((edit, editIndex) => (
                        <div key={`${edit.original}-${edit.corrected}-${editIndex}`} className="rounded-lg border border-line bg-panel px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-semibold text-rose">❌ {edit.original || "(missing)"}</span>
                            <span className="text-mute">→</span>
                            <span className="font-semibold text-mint">✅ {edit.corrected || "(removed)"}</span>
                          </div>
                        </div>
                      ))}
                      {corrections.length > 1 && corrections.map((issue, issueIndex) => issue.reason ? (
                        <div key={`reason-${issueIndex}`} className="rounded-lg border border-line bg-panel px-3 py-2 text-xs leading-5 text-mute">
                          <span className="font-semibold text-cream">Why:</span> {issue.reason}
                        </div>
                      ) : null)}
                    </div>
                  ) : null;
                })()}
                {!item.allIssues?.length && (
                  <p className="mt-3 text-xs leading-6 text-mute"><span className="font-semibold text-cream">Why:</span> {item.reason}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-line px-2.5 py-1 text-[10px] text-mute">{label(item.category)}</span>
                  <span className="rounded-full border border-line px-2.5 py-1 text-[10px] text-mute">{label(item.weakArea)}</span>
                  <span className="rounded-full border border-mint/20 bg-mint/5 px-2.5 py-1 text-[10px] text-mint">{Math.round((item.confidence || 0) * 100)}% confidence</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-panel p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Communication Feedback</p>
        {communication.feedback?.length ? (
          <div className="mt-3 space-y-2">
            {communication.feedback.map((item, index) => <div key={`${item}-${index}`} className="rounded-xl border border-line bg-panel2 p-3 text-sm leading-6 text-mute">💡 {item}</div>)}
          </div>
        ) : <p className="mt-3 text-sm text-mute">Finish a session to receive communication feedback.</p>}
      </div>

      {communication.adaptivePractice?.length ? (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-mint">Adaptive Practice Plan</p>
          <p className="mt-1 text-xs text-mute">The next exercises are selected from your current weak areas.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {communication.adaptivePractice.map((item, index) => (
              <div key={`${item.area}-${index}`} className="rounded-xl border border-line bg-panel2 p-4">
                <p className="text-xs font-bold text-cream">{item.area}</p>
                <p className="mt-1 text-xs leading-6 text-mute">{item.task}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {history.length > 0 && (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Progress Trend</p>
            <span className="text-[10px] text-mute">Last {history.length} sessions</span>
          </div>
          <div className="mt-4 flex items-end gap-2 overflow-x-auto pb-1">
            {history.map((item, index) => (
              <div key={`${item.date}-${index}`} className="min-w-[64px] text-center">
                <div className="mx-auto flex h-24 items-end justify-center">
                  <div className={`w-8 rounded-t-lg ${scoreTone(item.score)} bg-panel2`} style={{ height: `${Math.max(12, Math.min(100, item.score))}%` }} title={`${item.score}%`} />
                </div>
                <p className="mt-1 text-[10px] font-bold text-cream">{item.score}%</p>
                <p className="text-[9px] text-mute">{new Date(item.date).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Weak Areas & Personalized Practice</p>
          {trackedWeakAreas.length > 0 && <span className="text-[10px] text-mute">Tracked locally for this user</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(weakAreas.length ? weakAreas : trackedWeakAreas).map((area) => (
            <span key={area} className="rounded-full border border-gold/20 bg-gold/5 px-3 py-1.5 text-xs font-semibold text-gold">{area}</span>
          ))}
          {!weakAreas.length && !trackedWeakAreas.length && <span className="text-sm text-mute">Weak areas will appear after analysis.</span>}
        </div>

        {communication.recommendations?.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {communication.recommendations.map((item, index) => (
              <div key={`${item.area}-${index}`} className="rounded-xl border border-line bg-panel2 p-4">
                <p className="text-xs font-bold text-cream">{item.area}</p>
                <p className="mt-1 text-xs leading-6 text-mute">{item.task}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ScoreCard({ title, value, tone }: { title: string; value: string; tone: string }) {
  return <div className="rounded-2xl border border-line bg-panel p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-mute">{title}</p><p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p></div>;
}

function MiniScore({ title, value }: { title: string; value?: number }) {
  return <div className="rounded-xl border border-line bg-panel2 p-3"><p className="text-[10px] font-bold uppercase text-mute">{title}</p><p className={`mt-2 text-lg font-bold ${scoreTone(value)}`}>{percent(value)}</p></div>;
}

function Stat({ title, value }: { title: string; value: string }) {
  return <div className="rounded-2xl border border-line bg-panel p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-mute">{title}</p><p className="mt-2 text-2xl font-bold text-cream">{value}</p></div>;
}
