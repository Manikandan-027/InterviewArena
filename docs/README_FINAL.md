# InterviewArena Speaking Coach — FINAL Combined Build

Version: 8.0.0

This package combines the five planned phases into one self-hosted speaking/interview-coaching pipeline.

## Phase 1 — Accuracy

- Faster-Whisper local ASR with CUDA/float16 support when available.
- One continuous browser MediaRecorder session; analysis begins only after Finish Session.
- High-confidence deterministic grammar rules before neural GEC.
- Multiple grammar issues can be reported in one spoken sentence.
- Conservative T5 GEC fallback with content-preservation and similarity validation.
- Sentence-level corrected expression.
- Meaning-preservation checks using local MiniLM embeddings when available.
- ASR confidence is exposed separately so a low-confidence transcript is not presented as perfect recognition.

## Phase 2 — Communication

The response evaluates:

- Grammar
- Meaning preservation
- Idea coherence
- Vocabulary diversity / vague wording
- Clarity
- Fluency
- Speech delivery
- Filler words
- Repeated words
- Answer structure

All scores are **coaching indicators**, not scientific accuracy percentages.

## Phase 3 — Personalization

- Weak areas are retained per user in localStorage.
- Current weak areas are merged with previous weak areas.
- Adaptive practice tasks are generated from the user's weak profile.
- Session scores are stored locally and shown as a simple progress trend.

## Phase 4 — Interview Intelligence

When an interview question is supplied, the service evaluates:

- Question intent
- Answer relevance
- Covered concepts
- Missing concepts
- Answer structure
- Technical/project/behavioral answer cues
- Interview-specific next practice

## Phase 5 — Advanced Speech

The local Whisper word timestamps are used for:

- Speaking rate (WPM)
- Speech time
- Pause count
- Long-pause count
- Longest pause
- Filler count
- Repeated-word count
- Word recognition confidence
- Overall delivery score

### Pronunciation limitation

`pronunciationProxy` is deliberately labelled as a **recognition-confidence proxy**. It is not phoneme-level pronunciation scoring. Do not present it as a scientifically validated pronunciation accuracy percentage.

A true pronunciation module would require a dedicated phoneme/forced-alignment model and a pronunciation reference strategy. It is better to state this limitation than to fabricate a score.

## Files

- `ml-service/app.py` — FastAPI + local ML pipeline
- `ml-service/requirements-speaking.txt` — Python dependencies
- `frontend/src/components/SpeakingCoach.tsx` — complete speaking coach UI
- `frontend/src/app/api/speaking/analyze-audio/route.ts` — Next.js ML proxy
- `frontend/src/app/page.tsx` — page with Speaking Coach tab
- `tests/test_logic_smoke.py` — deterministic/analysis smoke tests

## Local configuration

Next.js `.env.local`:

```env
ML_SERVICE_URL=http://127.0.0.1:8001
```

Start the GPU service from the existing `interviewarena-gpu` environment:

```cmd
python app.py
```

Verify:

```cmd
curl http://127.0.0.1:8001/health
```

For Vercel, `ML_SERVICE_URL` must be a publicly reachable HTTPS FastAPI service. Never use `localhost` or `127.0.0.1` in the Vercel environment.

## Local semantic model

The default semantic model is:

`sentence-transformers/all-MiniLM-L6-v2`

It is loaded on CPU to keep the RTX 2050 VRAM available for speech/grammar inference. Once downloaded/cached, inference is local.

## Validation performed on this package

- Python `py_compile`: PASS
- Pure logic smoke tests: PASS
- TypeScript/TSX transpilation syntax check: PASS
- Critical regression checked: `Yesterday I go to temple to see God.` → `Yesterday I went to temple to see God.` without incorrectly changing `to see` → `to saw`.
- Multi-error examples verified, including past tense, subject-verb agreement, uncountable nouns, gerund/infinitive pattern, narrative past tense, and `I was spent`.

## What should not be claimed in the project presentation

Do not claim:

- 100% ASR accuracy
- 100% grammar accuracy
- scientifically validated communication scores
- true phoneme-level pronunciation accuracy
- human-level semantic understanding

A strong and defensible project claim is:

> InterviewArena is a self-hosted AI speaking and interview coach that combines local speech recognition, conservative grammar correction, semantic meaning checks, communication analysis, adaptive weak-area tracking, interview-answer evaluation, and speech-delivery metrics.
