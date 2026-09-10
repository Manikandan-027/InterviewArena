from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import sys
from contextlib import asynccontextmanager
from difflib import SequenceMatcher
from pathlib import Path
from threading import Lock
from typing import Any

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from faster_whisper import WhisperModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None

# ---------------------------------------------------------------------------
# InterviewArena Speaking ML
# ---------------------------------------------------------------------------
# Pipeline:
#   microphone -> one complete audio blob -> Whisper -> transcript
#   -> deterministic high-confidence grammar rules -> conservative GEC fallback
#   -> validated feedback -> statistics
#
# The grammar layer NEVER uses the correction model to invent content.
# Deterministic rules are preferred for known grammar patterns.
# ---------------------------------------------------------------------------

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

APP_NAME = "InterviewArena Speaking ML"
APP_VERSION = "9.0.0"
BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = os.getenv(
    "GEC_MODEL_PATH",
    str(BASE_DIR / "models" / "interviewarena-gec-v3"),
).strip()

WHISPER_MODEL_NAME = os.getenv("WHISPER_MODEL", "small.en").strip()
WHISPER_DEVICE = os.getenv(
    "WHISPER_DEVICE",
    "cuda" if torch.cuda.is_available() else "cpu",
).strip().lower()
WHISPER_COMPUTE_TYPE = os.getenv(
    "WHISPER_COMPUTE_TYPE",
    "float16" if WHISPER_DEVICE == "cuda" else "int8",
).strip().lower()

if WHISPER_DEVICE == "cuda" and not torch.cuda.is_available():
    WHISPER_DEVICE = "cpu"
    WHISPER_COMPUTE_TYPE = "int8"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
if DEVICE == "cpu":
    # The grammar model must match the actual available device.
    # This also avoids calling .half() on a CPU model.
    GEC_COMPUTE_TYPE = "fp32"
else:
    GEC_COMPUTE_TYPE = "fp16"

MAX_TEXT_LENGTH = 2000
MAX_AUDIO_SIZE = 15 * 1024 * 1024
MIN_WORDS_FOR_ANALYSIS = 3
MODEL_MAX_LENGTH = 128
SEMANTIC_MODEL_NAME = os.getenv(
    "SEMANTIC_MODEL",
    "sentence-transformers/all-MiniLM-L6-v2",
).strip()
SEMANTIC_MODEL_PATH = os.getenv(
    "SEMANTIC_MODEL_PATH",
    str(BASE_DIR / "models" / "all-MiniLM-L6-v2"),
).strip()

ALLOWED_ORIGINS = [
    item.strip()
    for item in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if item.strip()
]

logger = logging.getLogger("interviewarena.speaking")
logging.basicConfig(level=logging.INFO)
inference_lock = Lock()

tokenizer = None
gec_model = None
whisper_model = None
semantic_model = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_text(text: str) -> str:
    text = (text or "").replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def compare_text(text: str) -> str:
    value = normalize_text(text).lower()
    value = re.sub(r"[.!?,;:]+$", "", value)
    return value.strip()


def word_tokens(text: str) -> list[str]:
    return re.findall(r"\b[\w'-]+\b", text.lower())


def word_count(text: str) -> int:
    return len(word_tokens(text))


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, compare_text(a), compare_text(b)).ratio()


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def clamp_confidence(value: float) -> float:
    return round(clamp(value, 0.0, 0.99), 2)


def edit_objects(original: str, corrected: str) -> list[dict[str, str]]:
    old = original.split()
    new = corrected.split()
    matcher = SequenceMatcher(None, old, new)
    result: list[dict[str, str]] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        result.append(
            {
                "operation": "replace" if tag == "replace" else "remove" if tag == "delete" else "insert",
                "original": " ".join(old[i1:i2]),
                "corrected": " ".join(new[j1:j2]),
            }
        )
    return result


def no_issue(text: str) -> dict[str, Any]:
    return {
        "hasIssue": False,
        "confidence": 0.99,
        "original": text,
        "corrected": text,
        "reason": "",
        "weakArea": "",
        "category": "none",
        "severity": "none",
        "edits": [],
    }


# ---------------------------------------------------------------------------
# High-confidence grammar rules
# ---------------------------------------------------------------------------

DESTINATIONS = (
    "temple|school|college|market|office|park|church|hospital|station|home|university|company"
)


def preserve_case(source: str, replacement: str) -> str:
    if source.isupper():
        return replacement.upper()
    if source[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def apply_rule(
    text: str,
    pattern: str,
    replacement: str | Any,
    reason: str,
    weak_area: str,
    severity: str = "important",
) -> tuple[str, dict[str, Any]] | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    corrected = re.sub(pattern, replacement, text, count=1, flags=re.IGNORECASE)
    if compare_text(corrected) == compare_text(text):
        return None
    return corrected, {
        "reason": reason,
        "weakArea": weak_area,
        "severity": severity,
    }


def deterministic_correction(text: str, past_context: bool = False) -> dict[str, Any] | None:
    """Apply high-confidence grammar rules and return ONE feedback item per fix.

    Keeping each correction separate is important for teaching: a sentence such as
    "Yesterday I go ... because I need ..." should produce two understandable
    lessons instead of one generic paragraph of feedback.
    """
    current = text
    issues: list[dict[str, Any]] = []

    def record_change(before: str, after: str, reason: str, weak_area: str, severity: str = "important") -> None:
        if compare_text(before) == compare_text(after):
            return
        edits = edit_objects(before, after)
        if not edits:
            return
        issues.append({
            "hasIssue": True,
            "confidence": 0.99,
            "original": before,
            "corrected": after,
            "reason": reason,
            "weakArea": weak_area,
            "category": "grammar" if weak_area != "Fluency" else "fluency",
            "severity": severity,
            "edits": edits,
        })

    def run_rule(pattern: str, replacement: str | Any, reason: str, weak_area: str, severity: str = "important") -> bool:
        nonlocal current
        hit = apply_rule(current, pattern, replacement, reason, weak_area, severity)
        if not hit:
            return False
        before = current
        current, meta = hit
        record_change(before, current, meta["reason"], meta["weakArea"], meta["severity"])
        return True

    # 1) Past-time marker + "go". Handle all occurrences, not only the first one.
    past_go_pattern = rf"\b(yesterday|last\s+\w+|the\s+day\s+before)(,?)\s+(I|we|they|you)\s+go(?:es)?\b"
    while run_rule(
        past_go_pattern,
        lambda m: f"{m.group(1)}{m.group(2)} {m.group(3)} went",
        "A completed event in the past needs the past-tense verb 'went'. The word 'yesterday' signals past time.",
        "Past tense consistency",
    ):
        pass

    past_go_3p_pattern = rf"\b(yesterday|last\s+\w+|the\s+day\s+before)(,?)\s+(he|she|it)\s+go(?:es)?\b"
    while run_rule(
        past_go_3p_pattern,
        lambda m: f"{m.group(1)}{m.group(2)} {m.group(3)} went",
        "A completed event in the past needs the past-tense verb 'went'. The time expression signals past time.",
        "Past tense consistency",
    ):
        pass

    # 2) Past-time marker + common irregular verbs. Keep this deliberately
    # subject-aware: never change an infinitive such as "to see" just because
    # an earlier word such as "yesterday" appears in the sentence.
    past_pairs = {
        "go": "went", "come": "came", "buy": "bought", "see": "saw",
        "meet": "met", "eat": "ate", "take": "took", "make": "made",
        "get": "got", "give": "gave", "find": "found", "have": "had",
        "do": "did", "write": "wrote", "speak": "spoke", "run": "ran",
        "need": "needed", "decide": "decided", "return": "returned",
        "discuss": "discussed", "visit": "visited", "want": "wanted",
    }
    subjects = r"I|we|they|you|he|she|it"
    for present, past in past_pairs.items():
        # Direct finite verb after an explicit subject and a past-time marker.
        direct_pattern = rf"\b(yesterday|last\s+\w+|the\s+day\s+before|\d+\s+days?\s+ago)(,?)\s+({subjects})\s+{present}\b"
        while run_rule(
            direct_pattern,
            lambda m, p=past: f"{m.group(1)}{m.group(2)} {m.group(3)} {p}",
            f"The sentence describes a completed past event, so '{present}' should be the past form '{past}'.",
            "Past tense consistency",
        ):
            pass

        # Additional finite verbs joined to the same subject with a clear
        # conjunction. This catches: "I visited ... and I want ..." without
        # touching an infinitive such as "to see".
        joined_pattern = rf"\b({subjects})\s+[^.!?]{{0,70}}?\b(and|but)\s+({subjects})\s+{present}\b"
        while run_rule(
            joined_pattern,
            lambda m, p=past: f"{m.group(1)} {m.group(0).split(None, 2)[1]} {m.group(0).split(None, 2)[2]}" if False else re.sub(rf"\b{present}\b", p, m.group(0), count=1, flags=re.IGNORECASE),
            f"The surrounding narrative is in the past, so '{present}' should use the past form '{past}'.",
            "Past tense consistency",
        ):
            pass

    # Narrative clauses commonly used in completed stories. These are narrow
    # patterns rather than a blanket "everything after a past marker is past"
    # rule, which would create false positives for future and conditional clauses.
    narrative_pairs = [
        (r"\bBefore\s+(I|we|they|he|she|it)\s+leave\b", lambda m: f"Before {m.group(1)} left", "A completed story uses the past form 'left' after 'Before'."),
        (r"\bBefore\s+(I|we|they|he|she|it)\s+tell\b", lambda m: f"Before {m.group(1)} told", "A completed story uses the past form 'told' after 'Before'."),
        (r"\b(he|she|it)\s+tells\b", lambda m: f"{m.group(1)} told", "The surrounding completed story calls for the past form 'told'."),
    ]
    for pattern, replacement, reason in narrative_pairs:
        # Only apply these when a clear past-time marker or a completed-story
        # cue exists in the same sentence.
        if re.search(r"\b(last\s+\w+|yesterday|ago|before|after\s+lunch)\b", current, re.IGNORECASE):
            while run_rule(pattern, replacement, reason, "Past tense consistency"):
                pass

    # 3) Past-story negative auxiliaries. A completed story commonly uses
    # "didn't + base verb" rather than "don't/doesn't + base verb".
    # Apply this only when the sentence contains a clear past-story cue,
    # avoiding blanket rewrites of present-tense speech.
    if past_context or re.search(r"\b(yesterday|last\s+\w+|the\s+day\s+before|\d+\s+days?\s+ago|after\s+lunch|before\s+I|before\s+we|before\s+they|before\s+he|before\s+she|before\s+it)\b", current, re.IGNORECASE):
        while run_rule(
            r"\b(he|she|it|I|we|they|you)\s+(?:do|does)n['’]t\s+([a-z]+)\b",
            lambda m: f"{m.group(1)} didn't {m.group(2)}",
            "The sentence describes a completed past event, so use 'didn't + base verb' for a negative past statement.",
            "Past tense consistency",
        ):
            pass

    # 4) When a paragraph is clearly narrating a completed past event, a
    # sentence may continue that narrative without repeating "yesterday" or
    # "last weekend". Repair only a conservative set of unambiguous finite
    # verbs; do not touch infinitives ("to meet"), modals, or already-past forms.
    if past_context:
        inherited_pairs = {
            "go": "went", "visit": "visited", "want": "wanted",
            "need": "needed", "understand": "understood", "tell": "told",
            "leave": "left", "say": "said", "give": "gave", "meet": "met",
            "come": "came", "buy": "bought", "see": "saw", "eat": "ate",
            "take": "took", "make": "made", "get": "got", "find": "found",
            "have": "had", "do": "did", "write": "wrote", "speak": "spoke",
            "run": "ran", "decide": "decided", "return": "returned",
            "discuss": "discussed", "study": "studied", "work": "worked",
            "play": "played", "like": "liked", "help": "helped",
            "teach": "taught", "feel": "felt", "spend": "spent",
        }
        for present, past in inherited_pairs.items():
            # Subject + verb, excluding "to verb" by requiring the subject
            # immediately before the finite verb.
            inherited_pattern = rf"\b(I|we|they|you|he|she|it)\s+{present}\b"
            while run_rule(
                inherited_pattern,
                lambda m, p=past: f"{m.group(1)} {p}",
                f"The paragraph is describing a completed past event, so '{present}' should use the past form '{past}'.",
                "Past tense consistency",
            ):
                pass

    # 5) Present third-person singular. Repeatedly repair all clear occurrences.
    present_rules = [
        (r"\b(he|she|it)\s+go\b", lambda m: f"{m.group(1)} goes", "'He', 'she', and 'it' take 'goes' in the simple present."),
        (r"\b(he|she|it)\s+do\b", lambda m: f"{m.group(1)} does", "'He', 'she', and 'it' take 'does' in the simple present."),
        (r"\b(he|she|it)\s+have\b", lambda m: f"{m.group(1)} has", "'He', 'she', and 'it' take 'has' in the simple present."),
        (r"\b(he|she|it)\s+work\b", lambda m: f"{m.group(1)} works", "A singular third-person subject needs the -s form in the simple present."),
        (r"\b(he|she|it)\s+play\b", lambda m: f"{m.group(1)} plays", "A singular third-person subject needs the -s form in the simple present."),
        (r"\b(he|she|it)\s+like\b", lambda m: f"{m.group(1)} likes", "A singular third-person subject needs the -s form in the simple present."),
        (r"\b(he|she|it)\s+want\b", lambda m: f"{m.group(1)} wants", "A singular third-person subject needs the -s form in the simple present."),
        (r"\b(he|she|it)\s+study\b", lambda m: f"{m.group(1)} studies", "A singular third-person subject needs the correct -s/-ies form in the simple present."),
        (r"\b(he|she|it)\s+watch\b", lambda m: f"{m.group(1)} watches", "A singular third-person subject needs the -es form in the simple present."),
        (r"\b(he|she|it)\s+need\b", lambda m: f"{m.group(1)} needs", "A singular third-person subject needs the -s form in the simple present."),
        (r"\b(he|she|it)\s+say\b", lambda m: f"{m.group(1)} says", "A singular third-person subject needs the correct present-tense form."),
        (r"\b(he|she|it)\s+give\b", lambda m: f"{m.group(1)} gives", "A singular third-person subject needs the -s form in the simple present."),
        (r"\b(he|she|it)\s+meet\b", lambda m: f"{m.group(1)} meets", "A singular third-person subject needs the -s form in the simple present."),
    ]
    for pattern, repl, reason in present_rules:
        while run_rule(pattern, repl, reason, "Subject-verb agreement"):
            pass

    # 5) Known destinations need 'to'. Do not invent 'the'.
    destination_pattern = rf"\b(went|go|goes)\s+(the\s+)?({DESTINATIONS})\b"
    while run_rule(
        destination_pattern,
        lambda m: f"{m.group(1)} to {m.group(2) or ''}{m.group(3)}",
        "With these destinations, use the preposition 'to': for example, 'go to college' or 'went to the market'.",
        "Prepositions",
    ):
        pass

    # 6) Verb pattern: enjoy + gerund.
    gerund_map = {
        "play": "playing", "go": "going", "eat": "eating", "watch": "watching",
        "read": "reading", "learn": "learning", "study": "studying", "work": "working",
        "travel": "travelling", "write": "writing", "speak": "speaking", "cook": "cooking",
        "run": "running", "swim": "swimming", "dance": "dancing", "help": "helping",
    }
    for base, gerund in gerund_map.items():
        while run_rule(
            rf"\benjoy\s+to\s+{base}\b",
            f"enjoy {gerund}",
            "The verb 'enjoy' is followed by an -ing form, not 'to + verb'.",
            "Verb patterns",
        ):
            pass

    # 7) Articles before a vowel sound.
    article_words = "apple|elephant|engineer|exam|interview|idea|issue|hour|honest|umbrella|application|AI"
    while run_rule(
        rf"\ba\s+({article_words})\b",
        lambda m: f"an {m.group(1)}",
        "Use 'an' before a word that begins with a vowel sound.",
        "Articles and determiners",
        "minor",
    ):
        pass

    # 8) High-confidence uncountable noun errors.
    uncountable = [
        (r"\ban\s+advice\b", "some advice"), (r"\ba\s+advice\b", "some advice"),
        (r"\bmany\s+advice\b", "a lot of advice"), (r"\ba\s+information\b", "some information"),
        (r"\ban\s+information\b", "some information"), (r"\bmany\s+information\b", "a lot of information"),
        (r"\ba\s+furniture\b", "some furniture"), (r"\bmany\s+furniture\b", "a lot of furniture"),
        (r"\ba\s+equipment\b", "some equipment"), (r"\bmany\s+equipment\b", "a lot of equipment"),
    ]
    for pattern, repl in uncountable:
        while run_rule(
            pattern,
            repl,
            "This noun is normally uncountable, so use a suitable determiner such as 'some' or 'a lot of'.",
            "Countable and uncountable nouns",
        ):
            pass

    # 9) Verb-form constructions that are unambiguous in normal interview speech.
    # Keep these narrow so the rule does not turn legitimate passive constructions
    # such as "I was invited" into false positives.
    while run_rule(
        r"\bI\s+was\s+spent\b",
        "I spent",
        "'Spent' is already the main past-tense verb here, so 'was spent' is an incorrect verb construction. Use 'I spent'.",
        "Verb form",
    ):
        pass

    # 10) Specific verb + preposition patterns.
    prepositions = [
        (r"\binterested\s+on\b", "interested in", "'Interested' normally takes the preposition 'in'."),
        (r"\bgood\s+in\b", "good at", "When talking about an ability, use 'good at'."),
        (r"\bafraid\s+from\b", "afraid of", "The standard expression is 'afraid of'."),
        (r"\bdepend\s+of\b", "depend on", "The standard expression is 'depend on'."),
        (r"\bdiscussed\s+about\b", "discussed", "The verb 'discuss' directly takes its topic, so 'about' is unnecessary."),
    ]
    for pattern, repl, reason in prepositions:
        while run_rule(pattern, repl, reason, "Prepositions"):
            pass

    # 11) Duplicate adjacent words.
    while True:
        hit = re.search(r"\b([A-Za-z]+)(\s+)\1\b", current, flags=re.IGNORECASE)
        if not hit:
            break
        before = current
        current = re.sub(r"\b([A-Za-z]+)(\s+)\1\b", r"\1", current, count=1, flags=re.IGNORECASE)
        record_change(
            before,
            current,
            "The same word was repeated unnecessarily; removing the duplicate improves fluency.",
            "Fluency",
            "minor",
        )

    if not issues:
        return None

    # The first item remains the backwards-compatible primary analysis.
    primary = dict(issues[0])
    primary["allIssues"] = issues
    primary["issueCount"] = len(issues)
    primary["corrected"] = current
    primary["edits"] = edit_objects(text, current)
    primary["reason"] = " ".join(item["reason"] for item in issues)
    primary["weakArea"] = ", ".join(dict.fromkeys(item["weakArea"] for item in issues))
    primary["category"] = "grammar" if any(item["category"] == "grammar" for item in issues) else "fluency"
    primary["severity"] = "major" if any(item["severity"] == "major" for item in issues) else "important" if any(item["severity"] == "important" for item in issues) else "minor"
    return primary


# ---------------------------------------------------------------------------
# Conservative neural GEC fallback
# ---------------------------------------------------------------------------

STOP_WORDS = {
    "the", "a", "an", "to", "of", "in", "on", "at", "for", "and", "or", "but",
    "i", "we", "you", "he", "she", "it", "they", "is", "am", "are", "was", "were",
    "be", "been", "being", "have", "has", "had", "do", "does", "did", "go", "went",
    "going", "my", "your", "our", "their", "this", "that", "these", "those", "with",
}


def content_words(text: str) -> list[str]:
    return [w for w in word_tokens(text) if len(w) > 2 and w not in STOP_WORDS]


def morphology_related(a: str, b: str) -> bool:
    if a == b:
        return True
    if len(a) >= 4 and len(b) >= 4 and (a[:4] == b[:4] or a.rstrip("s") == b.rstrip("s")):
        return True
    pairs = {
        ("go", "went"), ("see", "saw"), ("buy", "bought"), ("meet", "met"),
        ("give", "gave"), ("have", "had"), ("do", "did"), ("make", "made"),
        ("take", "took"), ("come", "came"), ("get", "got"), ("run", "ran"),
    }
    return (a, b) in pairs or (b, a) in pairs


def safe_neural_prediction(original: str, prediction: str) -> bool:
    if not prediction or compare_text(original) == compare_text(prediction):
        return False
    if any(marker in prediction.lower() for marker in ["grammar:", "correction:", "explanation:", "corrected sentence:"]):
        return False

    ow = word_tokens(original)
    pw = word_tokens(prediction)
    if not ow or not pw:
        return False
    if len(pw) > len(ow) + 3 or len(pw) < max(2, len(ow) - 3):
        return False
    if similarity(original, prediction) < 0.86:
        return False

    # Content preservation is strict. A GEC model may change function words
    # and verb morphology, but it may not replace the speaker's nouns/adjectives.
    oc = content_words(original)
    pc = content_words(prediction)
    if oc:
        preserved = sum(1 for word in oc if word in pc)
        if preserved / len(oc) < 0.85:
            return False

    matcher = SequenceMatcher(None, ow, pw)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag != "replace":
            continue
        old_chunk = [w for w in ow[i1:i2] if w not in STOP_WORDS]
        new_chunk = [w for w in pw[j1:j2] if w not in STOP_WORDS]
        if old_chunk or new_chunk:
            if len(old_chunk) != len(new_chunk):
                return False
            if any(not morphology_related(a, b) for a, b in zip(old_chunk, new_chunk)):
                return False
    return True


@torch.inference_mode()
def gec_correct(text: str) -> str:
    if tokenizer is None or gec_model is None:
        return text
    encoded = tokenizer(
        f"gec: {text}",
        return_tensors="pt",
        max_length=MODEL_MAX_LENGTH,
        truncation=True,
    )
    encoded = {key: value.to(DEVICE) for key, value in encoded.items()}
    with inference_lock:
        generated = gec_model.generate(
            **encoded,
            max_length=MODEL_MAX_LENGTH,
            num_beams=5,
            num_return_sequences=1,
            do_sample=False,
            no_repeat_ngram_size=3,
            early_stopping=True,
        )
    return normalize_text(tokenizer.decode(generated[0], skip_special_tokens=True))


def classify_neural_error(original: str) -> tuple[str, str, str]:
    low = original.lower()
    if re.search(r"\b(yesterday|last\s+\w+|ago)\b", low):
        return "grammar", "Past tense consistency", "important"
    if re.search(r"\b(he|she|it)\b", low):
        return "grammar", "Subject-verb agreement", "important"
    if re.search(r"\b(a|an|the)\b", low):
        return "grammar", "Articles and determiners", "minor"
    return "grammar", "General grammar", "minor"


sys.path.insert(0, str(BASE_DIR))
from grammar_engine import deterministic_correction as comprehensive_deterministic_correction, tense_analysis as comprehensive_tense_analysis


# Comprehensive multi-pass grammar engine. The legacy rules above remain for reference,
# but this implementation is authoritative and rechecks after every correction.
deterministic_correction = comprehensive_deterministic_correction


def analyze_text(text: str, previous_weak_areas: list[str] | None = None, past_context: bool = False) -> dict[str, Any]:
    original = normalize_text(text)
    if not original or word_count(original) < MIN_WORDS_FOR_ANALYSIS:
        return no_issue(original)

    # Deterministic rules are authoritative for speech.
    deterministic = deterministic_correction(original, past_context=past_context)
    if deterministic:
        return deterministic

    # Neural GEC is only a conservative fallback.
    try:
        prediction = gec_correct(original)
    except Exception:
        logger.exception("GEC inference failed")
        return no_issue(original)

    if not safe_neural_prediction(original, prediction):
        return no_issue(original)

    edits = edit_objects(original, prediction)
    if not edits:
        return no_issue(original)

    category, weak_area, severity = classify_neural_error(original)
    sim = similarity(original, prediction)
    confidence = clamp_confidence(0.84 + max(0.0, sim - 0.86) * 0.8)
    return {
        "hasIssue": True,
        "confidence": confidence,
        "original": original,
        "corrected": prediction,
        "reason": f"The sentence needs improvement in {weak_area.lower()}.",
        "weakArea": weak_area,
        "category": category,
        "severity": severity,
        "edits": edits,
    }



# ---------------------------------------------------------------------------
# Meaning, coherence, vocabulary and communication analysis
# ---------------------------------------------------------------------------

FILLER_WORDS = {
    "um", "uh", "erm", "hmm", "like", "actually", "basically",
    "you know", "sort of", "kind of", "i mean",
}

COMMON_WEAK_PHRASES = {
    "very good": "stronger: excellent / effective / reliable",
    "very bad": "stronger: poor / ineffective / unreliable",
    "thing": "name the exact thing, feature, tool, or concept",
    "stuff": "name the specific items or concepts",
    "something": "state what the specific thing is",
}


def semantic_similarity(a: str, b: str) -> float:
    """Return sentence-level semantic similarity using a local embedding model.

    If the optional embedding model is unavailable, use a conservative lexical
    fallback. This is a coaching signal, not a scientific semantic score.
    """
    a = normalize_text(a)
    b = normalize_text(b)
    if not a or not b:
        return 0.0
    if compare_text(a) == compare_text(b):
        return 1.0

    if semantic_model is not None:
        try:
            embeddings = semantic_model.encode(
                [a, b],
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
            value = float((embeddings[0] * embeddings[1]).sum())
            return clamp((value + 1.0) / 2.0, 0.0, 1.0)
        except Exception:
            logger.exception("Semantic embedding failed; using lexical fallback")

    return similarity(a, b)


def lexical_vocabulary_score(text: str) -> tuple[float, list[str]]:
    tokens = word_tokens(text)
    if not tokens:
        return 0.0, []

    meaningful = [w for w in tokens if len(w) > 2]
    unique = set(meaningful)
    diversity = len(unique) / max(1, len(meaningful))
    repeats = len(meaningful) - len(unique)

    score = 62.0 + diversity * 38.0
    if repeats >= max(4, len(meaningful) // 3):
        score -= 12.0
    if len(unique) >= 12:
        score += 3.0
    score = clamp(score, 45.0, 100.0)

    suggestions: list[str] = []
    low = compare_text(text)
    for phrase, suggestion in COMMON_WEAK_PHRASES.items():
        if re.search(rf"\b{re.escape(phrase)}\b", low):
            suggestions.append(suggestion)
    return round(score, 1), suggestions


def filler_analysis(text: str) -> tuple[int, list[str]]:
    low = text.lower()
    counts: list[str] = []
    total = 0
    for filler in FILLER_WORDS:
        n = len(re.findall(rf"\b{re.escape(filler)}\b", low))
        if n:
            total += n
            counts.append(f"{filler} ({n})")
    return total, counts


def clarity_analysis(text: str, sentence_count: int) -> tuple[float, list[str]]:
    words = word_tokens(text)
    if not words:
        return 0.0, ["No speech was detected."]

    fillers, filler_list = filler_analysis(text)
    avg_sentence_words = len(words) / max(1, sentence_count)
    score = 92.0
    suggestions: list[str] = []

    if avg_sentence_words > 32:
        score -= 10
        suggestions.append("Break long ideas into shorter sentences.")
    elif avg_sentence_words > 24:
        score -= 5
        suggestions.append("Use shorter sentences when explaining technical ideas.")

    filler_ratio = fillers / max(1, len(words))
    if filler_ratio > 0.08:
        score -= 14
        suggestions.append("Reduce filler words and pause briefly instead.")
    elif filler_ratio > 0.04:
        score -= 7
        suggestions.append("Reduce repeated filler words.")

    if re.search(r"\b(and|but)\s+(and|but)\b", text, re.IGNORECASE):
        score -= 5
        suggestions.append("Avoid repeated connectors; separate the ideas clearly.")

    if re.search(r"\b(because|so|therefore|however|but)\b", text, re.IGNORECASE):
        score += 3

    if filler_list:
        suggestions.append("Filler usage: " + ", ".join(filler_list[:4]) + ".")

    return round(clamp(score, 40.0, 100.0), 1), suggestions


def meaning_analysis(
    original: str,
    corrected: str,
    analyses: list[dict[str, Any]],
) -> dict[str, Any]:
    """Assess whether the speaker's intended idea survives correction.

    This deliberately avoids inventing a hidden story. It compares the spoken
    sentence with its grammar-corrected form and reports when the wording is
    too uncertain to interpret confidently.
    """
    sim = semantic_similarity(original, corrected)
    original_content = set(content_words(original))
    corrected_content = set(content_words(corrected))
    preserved = (
        len(original_content & corrected_content) / len(original_content)
        if original_content else 1.0
    )

    score = 100.0
    if sim < 0.72:
        score -= 28
    elif sim < 0.82:
        score -= 16
    elif sim < 0.90:
        score -= 8

    if preserved < 0.70:
        score -= 18
    elif preserved < 0.85:
        score -= 8

    score = round(clamp(score, 45.0, 100.0), 1)

    if sim >= 0.90 and preserved >= 0.85:
        status = "Meaning preserved"
        explanation = "Your main idea remains clear after grammar correction."
    elif sim >= 0.78 and preserved >= 0.70:
        status = "Meaning mostly clear"
        explanation = "The main idea is understandable, but some wording could be more direct."
    else:
        status = "Meaning needs clarification"
        explanation = "The wording is difficult to interpret reliably. State the main idea more directly."

    return {
        "score": score,
        "status": status,
        "explanation": explanation,
        "semanticSimilarity": round(sim * 100.0, 1),
        "contentPreservation": round(preserved * 100.0, 1),
    }


def build_message_summary(transcript: str, analyses: list[dict[str, Any]]) -> str:
    corrected = transcript
    # Apply confirmed sentence corrections to give the user a clean expression
    # of the same message. Do not create new content.
    for item in analyses:
        old = str(item.get("original") or "")
        new = str(item.get("corrected") or "")
        if old and new:
            corrected = corrected.replace(old, new, 1)
    corrected = normalize_text(corrected)
    if not corrected:
        return "No clear message could be extracted from the recording."
    return corrected


QUESTION_INTENTS = [
    ("self introduction", r"\b(tell|describe)\s+(me\s+)?about\s+yourself\b|\bintroduce yourself\b"),
    ("project explanation", r"\b(project|application|system)\b.*\b(explain|describe|develop|built|build)\b|\bexplain\s+(your|a)\s+project\b"),
    ("technical concept", r"\b(what is|what are|explain|define|difference between|compare)\b"),
    ("behavioral", r"\b(tell me about a time|describe a time|how did you handle|how would you handle|challenge|conflict|failure|leadership)\b"),
    ("experience", r"\b(experience|worked|internship|previous role|background)\b"),
]

def classify_question_intent(question: str) -> str:
    low = normalize_text(question).lower()
    if not low:
        return "General interview answer"
    for intent, pattern in QUESTION_INTENTS:
        if re.search(pattern, low, re.IGNORECASE):
            return intent
    return "General interview answer"


def question_keywords(question: str) -> list[str]:
    stop = STOP_WORDS | {
        "what", "why", "how", "when", "where", "which", "who", "tell", "explain",
        "describe", "your", "you", "can", "could", "would", "should", "about", "please",
        "difference", "between", "example", "give", "me", "is", "are", "the",
    }
    words = [w for w in word_tokens(question) if len(w) >= 4 and w not in stop]
    return list(dict.fromkeys(words))[:12]


INTERVIEW_CONCEPT_SYNONYMS = {
    "family": {"family", "mother", "father", "parent", "parents", "brother", "sister", "grandmother", "grandfather", "relative"},
    "experience": {"experience", "event", "incident", "situation", "occasion", "time", "day", "challenge", "project", "internship"},
    "project": {"project", "application", "system", "software", "app", "website", "platform"},
    "skills": {"skill", "skills", "python", "java", "javascript", "sql", "coding", "programming"},
    "team": {"team", "teammate", "colleague", "member", "group", "collaborate", "collaboration"},
    "leadership": {"leadership", "leader", "lead", "managed", "organized", "team", "responsibility"},
}

def keyword_is_covered(keyword: str, answer_words: set[str]) -> bool:
    if keyword in answer_words:
        return True
    synonyms = INTERVIEW_CONCEPT_SYNONYMS.get(keyword, set())
    return bool(synonyms & answer_words)


def interview_relevance(question: str, transcript: str) -> dict[str, Any]:
    q = normalize_text(question)
    answer = normalize_text(transcript)
    if not q:
        return {"available": False, "score": None, "intent": "General interview answer", "matchedKeywords": [], "missingKeywords": [], "explanation": "Add the interview question to evaluate whether your answer directly addresses it."}
    keywords = question_keywords(q)
    answer_low = answer.lower()
    answer_words = set(word_tokens(answer))
    matched = [word for word in keywords if keyword_is_covered(word, answer_words) or re.search(rf"\b{re.escape(word)}\b", answer_low)]
    missing = [word for word in keywords if word not in matched]
    semantic = semantic_similarity(q, answer)
    keyword_score = (len(matched) / len(keywords)) if keywords else 0.5
    # A lexical fallback such as SequenceMatcher can be very low for perfectly
    # relevant paraphrases (e.g. "family" vs "grandmother"). Never let that
    # fallback collapse relevance to near-zero. The MiniLM model, when loaded,
    # supplies the stronger semantic signal.
    if semantic_model is None:
        score = 50.0 + (keyword_score * 50.0)
    else:
        score = (semantic * 65.0) + (keyword_score * 35.0)
    score = round(clamp(score, 0.0, 100.0), 1)
    if score >= 78:
        explanation = "Your answer is closely related to the question."
    elif score >= 58:
        explanation = "Your answer is partly related, but make the main answer more direct."
    else:
        explanation = "Your answer may not directly address the question. Start with the main point the question asks for."
    return {"available": True, "score": score, "intent": classify_question_intent(q), "matchedKeywords": matched, "missingKeywords": missing[:8], "explanation": explanation}


def build_intent_feedback(question: str, transcript: str, relevance: dict[str, Any]) -> list[str]:
    if not question.strip() or not relevance.get("available"):
        return []
    score = float(relevance.get("score") or 0)
    tips: list[str] = []
    if score < 78:
        tips.append("Answer the exact question first, then add your reason or example.")
    intent = str(relevance.get("intent") or "")
    if intent == "technical concept" and not re.search(r"\b(example|for instance|means|used|works|because)\b", transcript, re.IGNORECASE):
        tips.append("For technical questions, explain the concept, how it works, and give a short example.")
    if intent == "project explanation" and not re.search(r"\b(problem|solution|result|built|developed|implemented)\b", transcript, re.IGNORECASE):
        tips.append("Explain a project using problem → solution → result.")
    if intent == "self introduction" and word_count(transcript) < 35:
        tips.append("Include your education, key technical skills, projects, and the role you are targeting.")
    return tips[:3]


def interview_structure_analysis(question: str, transcript: str, intent: str) -> dict[str, Any]:
    """Evaluate whether an interview answer has a useful structure.

    This is deliberately explainable and keyword/structure based rather than
    pretending to be a human interviewer. It is a coaching signal.
    """
    text = normalize_text(transcript)
    low = text.lower()
    words = word_count(text)
    if not question.strip():
        return {"available": False, "score": None, "covered": [], "missing": [], "explanation": "Add the interview question to evaluate answer structure."}

    covered: list[str] = []
    missing: list[str] = []
    if words >= 12:
        covered.append("direct response")
    else:
        missing.append("direct response")

    if re.search(r"\b(because|so|therefore|since|reason)\b", low):
        covered.append("reason")
    else:
        missing.append("reason")

    if re.search(r"\b(for example|for instance|example|such as|when i|when we|in my project)\b", low):
        covered.append("example/evidence")
    else:
        missing.append("example/evidence")

    if intent == "behavioral":
        if re.search(r"\b(i did|i handled|i solved|i implemented|i learned|result|outcome|finally)\b", low):
            covered.append("action/result")
        else:
            missing.append("action/result")
    elif intent == "technical concept":
        if re.search(r"\b(works|used|means|consists|steps?|complexity|o\s*\(|time|space)\b", low):
            covered.append("technical explanation")
        else:
            missing.append("technical explanation")
    elif intent == "project explanation":
        if re.search(r"\b(problem|challenge)\b", low):
            covered.append("problem")
        else:
            missing.append("problem")
        if re.search(r"\b(solution|implemented|developed|built|technology|tech stack)\b", low):
            covered.append("solution")
        else:
            missing.append("solution")
        if re.search(r"\b(result|outcome|improved|success|achieved)\b", low):
            covered.append("result")
        else:
            missing.append("result")

    score = clamp(55.0 + len(covered) * 10.0 - len(missing) * 5.0, 35.0, 100.0)
    if score >= 80:
        explanation = "Your answer has a useful interview structure."
    elif score >= 60:
        explanation = "Your answer has a basic structure, but add the missing support points."
    else:
        explanation = "Start with a direct answer, then give a reason, example, and result where appropriate."
    return {
        "available": True,
        "score": round(score, 1),
        "covered": covered,
        "missing": missing,
        "explanation": explanation,
    }


def build_adaptive_practice_plan(
    weak_areas: list[str],
    scores: dict[str, Any],
    relevance: dict[str, Any],
) -> list[dict[str, str]]:
    """Create deterministic next exercises from the current weak profile."""
    plans: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(area: str, task: str) -> None:
        if area not in seen:
            seen.add(area)
            plans.append({"area": area, "task": task})

    for area in weak_areas:
        low = area.lower()
        if "past tense" in low:
            add("Past tense", "Speak 5 sentences about yesterday. Use at least three irregular past verbs.")
        elif "subject-verb" in low:
            add("Subject-verb agreement", "Describe a person for 30 seconds using he/she/it with correct present-tense verbs.")
        elif "verb form" in low:
            add("Verb forms", "Explain one daily activity using the correct infinitive, gerund, and past forms.")
        elif "meaning" in low:
            add("Meaning clarity", "Answer one question with: main point → reason → example. Avoid vague wording.")
        elif "coherence" in low:
            add("Coherence", "Explain a project in order: problem → approach → result.")
        elif "vocabulary" in low:
            add("Vocabulary", "Replace generic words with 5 specific technical or descriptive words.")
        elif "clarity" in low:
            add("Clarity", "Give a 45-second answer using short sentences and one idea per sentence.")
        elif "fluency" in low or "delivery" in low:
            add("Fluency & delivery", "Repeat a 60-second answer at a steady pace with silent pauses instead of fillers.")
        elif "relevance" in low:
            add("Answer relevance", "State the direct answer in your first sentence, then support it with one example.")
        elif "audio" in low or "recognition" in low:
            add("Audio quality", "Practice in a quiet room with the microphone close and speak at a natural volume.")

    relevance_score = relevance.get("score") if relevance.get("available") else None
    if relevance_score is not None and float(relevance_score) < 65:
        add("Interview relevance", "Read the question once, state the direct answer first, then explain only points related to that question.")

    if float(scores.get("fluency", 100) or 100) < 75:
        add("Speaking pace", "Repeat the same answer once at a slower, steady interview pace.")

    if not plans:
        add("Advanced practice", "Give a 60-second answer with a direct point, reason, concrete example, and concise conclusion.")
    return plans[:6]


def build_communication_feedback(
    transcript: str,
    corrected_transcript: str,
    analyses: list[dict[str, Any]],
    sentences: list[str],
    asr_confidence: float,
    duration: float,
    question: str = "",
    speech_metrics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    words = word_count(transcript)
    mistake_count = sum(int(item.get("issueCount", 1)) for item in analyses)
    grammar_score = round(clamp(100.0 - (mistake_count * 7.0), 0.0, 100.0), 1)
    if mistake_count == 0:
        grammar_score = 100.0

    sentence_meanings: list[dict[str, Any]] = []
    for sentence in sentences:
        sentence_result = next(
            (item for item in analyses if compare_text(item.get("original", "")) == compare_text(sentence)),
            None,
        )
        corrected = sentence_result.get("corrected", sentence) if sentence_result else sentence
        sentence_meanings.append(
            meaning_analysis(sentence, str(corrected), [sentence_result] if sentence_result else [])
        )

    if sentence_meanings:
        meaning_score = round(sum(x["score"] for x in sentence_meanings) / len(sentence_meanings), 1)
    else:
        meaning_score = 0.0

    coherence_scores: list[float] = []
    if len(sentences) >= 2:
        for previous, current in zip(sentences, sentences[1:]):
            coherence_scores.append(semantic_similarity(previous, current))
        coherence_raw = sum(coherence_scores) / len(coherence_scores)
        coherence_score = round(clamp(55.0 + coherence_raw * 45.0, 0.0, 100.0), 1)
    else:
        coherence_score = 92.0 if words >= 8 else 80.0

    vocabulary_score, vocabulary_tips = lexical_vocabulary_score(transcript)
    clarity_score, clarity_tips = clarity_analysis(transcript, len(sentences))
    fluency_score = compute_fluency(words, duration)
    asr_score = round(clamp(asr_confidence * 100.0, 0.0, 100.0), 1)
    speech_metrics = speech_metrics or {}
    delivery_score = float(speech_metrics.get("deliveryScore", fluency_score) or fluency_score)
    pronunciation_proxy = float(speech_metrics.get("pronunciationProxy", asr_score) or asr_score)
    relevance = interview_relevance(question, transcript)
    relevance_score = relevance.get("score") if relevance.get("available") else None
    intent = str(relevance.get("intent") or "General interview answer")
    structure = interview_structure_analysis(question, transcript, intent)
    structure_score = structure.get("score") if structure.get("available") else None

    # Communication score is a coaching indicator, not model accuracy.
    base_overall = (
        0.28 * grammar_score
        + 0.24 * meaning_score
        + 0.16 * coherence_score
        + 0.12 * vocabulary_score
        + 0.12 * clarity_score
        + 0.05 * fluency_score
        + 0.03 * delivery_score
    )
    if relevance_score is not None:
        overall = round(
            0.85 * base_overall
            + 0.10 * float(relevance_score)
            + 0.05 * float(structure_score or 0),
            1,
        )
    else:
        overall = round(base_overall, 1)

    feedback: list[str] = []
    if grammar_score < 90:
        feedback.append("Focus on the confirmed grammar patterns shown below.")
    if meaning_score < 85:
        feedback.append("Make the main idea explicit before adding supporting details.")
    if coherence_score < 80:
        feedback.append("Connect each idea to the previous one instead of jumping between topics.")
    feedback.extend(clarity_tips[:2])
    feedback.extend(vocabulary_tips[:2])
    if fluency_score < 75:
        feedback.append("Use a steady speaking pace and short pauses between ideas.")
    if float(speech_metrics.get("fillerCount", 0) or 0) >= 3:
        feedback.append("Reduce filler words and replace them with short silent pauses.")
    if float(speech_metrics.get("longPauseCount", 0) or 0) >= 2:
        feedback.append("Plan your next idea before speaking to reduce long pauses.")
    if float(speech_metrics.get("repeatedWordCount", 0) or 0) >= 2:
        feedback.append("Avoid repeating the same word when searching for your next idea.")
    if asr_score < 65:
        feedback.append("Audio confidence is low; speak closer to the microphone and reduce background noise.")
    feedback.extend(build_intent_feedback(question, transcript, relevance))
    if not feedback:
        feedback.append("Your message is clear. Keep the same structure and improve vocabulary gradually.")

    weak_areas: list[str] = []
    for item in analyses:
        area = str(item.get("weakArea") or "").strip()
        if area and area not in weak_areas:
            weak_areas.append(area)
    if meaning_score < 85 and "Meaning clarity" not in weak_areas:
        weak_areas.append("Meaning clarity")
    if coherence_score < 80 and "Idea coherence" not in weak_areas:
        weak_areas.append("Idea coherence")
    if vocabulary_score < 75 and "Vocabulary" not in weak_areas:
        weak_areas.append("Vocabulary")
    if clarity_score < 80 and "Clarity" not in weak_areas:
        weak_areas.append("Clarity")
    if fluency_score < 75 and "Fluency" not in weak_areas:
        weak_areas.append("Fluency")
    if relevance_score is not None and relevance_score < 65 and "Answer relevance" not in weak_areas:
        weak_areas.append("Answer relevance")
    if structure_score is not None and float(structure_score) < 65 and "Answer structure" not in weak_areas:
        weak_areas.append("Answer structure")
    if delivery_score < 75 and "Speech delivery" not in weak_areas:
        weak_areas.append("Speech delivery")
    if pronunciation_proxy < 70 and "Speech recognition confidence" not in weak_areas:
        weak_areas.append("Speech recognition confidence")

    recommendations: list[dict[str, str]] = []
    if any("Past tense" in x for x in weak_areas):
        recommendations.append({"area": "Past tense consistency", "task": "Speak 5 sentences about what you did yesterday using went, saw, met, ate, and bought."})
    if any("Subject-verb" in x for x in weak_areas):
        recommendations.append({"area": "Subject-verb agreement", "task": "Describe a friend or family member using he/she + correct present-tense verbs."})
    if "Meaning clarity" in weak_areas:
        recommendations.append({"area": "Meaning clarity", "task": "Answer one interview question using: main point → reason → example."})
    if "Idea coherence" in weak_areas:
        recommendations.append({"area": "Idea coherence", "task": "Explain one project in three connected steps: problem → solution → result."})
    if "Vocabulary" in weak_areas:
        recommendations.append({"area": "Vocabulary", "task": "Replace generic words such as 'thing', 'stuff', and 'very good' with specific technical words."})
    if "Clarity" in weak_areas:
        recommendations.append({"area": "Clarity", "task": "Give a 45-second answer using short sentences and deliberate pauses."})
    if "Fluency" in weak_areas:
        recommendations.append({"area": "Fluency", "task": "Practice speaking at a steady interview pace without rushing."})
    if "Answer relevance" in weak_areas:
        recommendations.append({"area": "Answer relevance", "task": "Answer the exact question in one sentence first, then support it with a reason and example."})
    if "Answer structure" in weak_areas:
        recommendations.append({"area": "Answer structure", "task": "Use the structure that fits the question: direct answer → reason → example; for projects use problem → solution → result."})
    if "Speech delivery" in weak_areas:
        recommendations.append({"area": "Speech delivery", "task": "Practice a 60-second answer at a steady pace, using a short silent pause between each main idea."})
    if "Speech recognition confidence" in weak_areas:
        recommendations.append({"area": "Audio quality", "task": "Use a quiet room, keep the microphone close, and speak clearly at a natural volume."})
    if not recommendations:
        recommendations.append({"area": "Next level", "task": "Give a 60-second interview answer with a clear point, reason, example, and conclusion."})

    return {
        "relevance": relevance,
        "scores": {
            "grammar": grammar_score,
            "meaning": meaning_score,
            "coherence": coherence_score,
            "vocabulary": vocabulary_score,
            "clarity": clarity_score,
            "fluency": fluency_score,
            "delivery": round(delivery_score, 1),
            "pronunciationProxy": round(pronunciation_proxy, 1),
            "asrConfidence": asr_score,
            "overallCommunication": overall,
            "relevance": relevance_score,
            "structure": structure_score,
        },
        "message": build_message_summary(transcript, analyses),
        "meaning": {
            "status": "Meaning preserved" if meaning_score >= 90 else "Meaning mostly clear" if meaning_score >= 78 else "Meaning needs clarification",
            "explanation": "Your main idea remains clear after grammar correction." if meaning_score >= 90 else "The main idea is understandable, but some wording could be more direct." if meaning_score >= 78 else "The wording is difficult to interpret reliably. State the main idea more directly.",
        },
        "feedback": list(dict.fromkeys(feedback)),
        "weakAreas": weak_areas,
        "recommendations": recommendations[:5],
        "adaptivePractice": build_adaptive_practice_plan(weak_areas, {"fluency": fluency_score}, relevance),
        "structure": structure,
        "sentenceMeaning": sentence_meanings,
        "speechMetrics": speech_metrics,
    }

# ---------------------------------------------------------------------------
# Model loading / FastAPI
# ---------------------------------------------------------------------------


def load_models() -> None:
    global tokenizer, gec_model, whisper_model, semantic_model

    if not Path(MODEL_PATH).exists():
        raise RuntimeError(
            f"GEC model not found: {MODEL_PATH}. "
            "Set GEC_MODEL_PATH to the folder containing config.json and model weights."
        )

    logger.info("Loading GEC model from %s", MODEL_PATH)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=True)
    gec_model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_PATH, local_files_only=True)
    gec_model.to(DEVICE)
    if DEVICE == "cuda":
        gec_model.half()
    gec_model.eval()

    logger.info(
        "Loading faster-whisper model=%s device=%s compute=%s",
        WHISPER_MODEL_NAME,
        WHISPER_DEVICE,
        WHISPER_COMPUTE_TYPE,
    )
    whisper_model = WhisperModel(
        WHISPER_MODEL_NAME,
        device=WHISPER_DEVICE,
        compute_type=WHISPER_COMPUTE_TYPE,
        cpu_threads=max(2, min(8, os.cpu_count() or 4)),
        num_workers=1,
    )

    # Semantic model stays on CPU so the RTX 2050 VRAM is reserved for
    # Whisper + GEC. If it cannot be loaded, the service still works with
    # the deterministic lexical fallback.
    if SentenceTransformer is not None:
        try:
            semantic_source = SEMANTIC_MODEL_PATH if Path(SEMANTIC_MODEL_PATH).exists() else SEMANTIC_MODEL_NAME
            logger.info("Loading local semantic model=%s on CPU", semantic_source)
            semantic_model = SentenceTransformer(semantic_source, device="cpu")
            logger.info("Semantic model loaded")
        except Exception:
            semantic_model = None
            logger.exception("Semantic model unavailable; using lexical fallback")
    else:
        logger.warning("sentence-transformers is not installed; using lexical semantic fallback")

    logger.info("All speaking ML models loaded")


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_models()
    yield


app = FastAPI(title=APP_NAME, version=APP_VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    userId: str | None = None
    previousWeakAreas: list[str] = Field(default_factory=list)
    question: str | None = Field(default=None, max_length=1000)


# ---------------------------------------------------------------------------
# Audio analysis
# ---------------------------------------------------------------------------


def transcribe_audio(audio_path: str) -> tuple[str, float, float, list[dict[str, float]], dict[str, Any]]:
    if whisper_model is None:
        raise RuntimeError("Whisper model is not loaded")

    parts: list[str] = []
    confidences: list[float] = []
    timing: list[dict[str, float]] = []
    word_timing: list[dict[str, Any]] = []

    with inference_lock:
        segments, _ = whisper_model.transcribe(
            audio_path,
            language="en",
            task="transcribe",
            beam_size=5,
            best_of=5,
            temperature=0.0,
            vad_filter=True,
            vad_parameters={
                "min_silence_duration_ms": 500,
                "speech_pad_ms": 250,
                "min_speech_duration_ms": 250,
            },
            condition_on_previous_text=True,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.6,
            word_timestamps=True,
            initial_prompt=(
                "English interview practice. Topics may include programming, "
                "software projects, education, skills, college, career, and interviews."
            ),
        )
        for segment in segments:
            value = normalize_text(segment.text)
            if not value:
                continue
            parts.append(value)
            # avg_logprob is normally <= 0. Map it to a bounded confidence.
            logprob = float(getattr(segment, "avg_logprob", -1.0))
            no_speech = float(getattr(segment, "no_speech_prob", 0.0))
            conf = clamp(1.0 + logprob, 0.0, 1.0) * (1.0 - clamp(no_speech, 0.0, 0.95))
            confidences.append(conf)
            timing.append({"start": float(segment.start), "end": float(segment.end)})
            segment_words = getattr(segment, "words", None) or []
            for word in segment_words:
                raw_word = normalize_text(str(getattr(word, "word", "")))
                if not raw_word:
                    continue
                start = float(getattr(word, "start", segment.start))
                end = float(getattr(word, "end", segment.end))
                probability = float(getattr(word, "probability", 0.0) or 0.0)
                word_timing.append({
                    "word": raw_word,
                    "start": start,
                    "end": end,
                    "probability": clamp(probability, 0.0, 1.0),
                })

    transcript = normalize_text(" ".join(parts))
    asr_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    duration = timing[-1]["end"] if timing else 0.0
    speech_metrics = build_speech_metrics(word_timing, timing, duration)
    return transcript, asr_confidence, duration, timing, speech_metrics



def build_speech_metrics(
    word_timing: list[dict[str, Any]],
    segment_timing: list[dict[str, float]],
    duration_seconds: float,
) -> dict[str, Any]:
    """Derive delivery metrics from Whisper timestamps.

    These are coaching indicators. Word confidence is an ASR-confidence proxy,
    not a phoneme-level pronunciation score.
    """
    if not word_timing:
        return {
            "speakingRateWpm": 0.0,
            "speechTimeSeconds": 0.0,
            "pauseCount": 0,
            "longPauseCount": 0,
            "longestPauseSeconds": 0.0,
            "fillerCount": 0,
            "fillers": [],
            "repeatedWordCount": 0,
            "wordConfidence": 0.0,
            "pronunciationProxy": 0.0,
            "deliveryScore": 0.0,
        }

    cleaned = []
    for item in word_timing:
        token = re.sub(r"[^a-zA-Z'-]", "", str(item.get("word", "")).lower())
        if not token:
            continue
        cleaned.append({
            **item,
            "token": token,
            "start": float(item.get("start", 0.0)),
            "end": float(item.get("end", 0.0)),
            "probability": float(item.get("probability", 0.0)),
        })

    if not cleaned:
        return {
            "speakingRateWpm": 0.0, "speechTimeSeconds": 0.0, "pauseCount": 0,
            "longPauseCount": 0, "longestPauseSeconds": 0.0, "fillerCount": 0,
            "fillers": [], "repeatedWordCount": 0, "wordConfidence": 0.0,
            "pronunciationProxy": 0.0, "deliveryScore": 0.0,
        }

    speech_time = sum(max(0.0, item["end"] - item["start"]) for item in cleaned)
    pauses: list[float] = []
    for previous, current in zip(cleaned, cleaned[1:]):
        gap = max(0.0, current["start"] - previous["end"])
        if gap >= 0.7:
            pauses.append(gap)

    filler_terms = {"um", "uh", "erm", "hmm", "like", "actually", "basically", "so", "well"}
    filler_counts: dict[str, int] = {}
    for item in cleaned:
        if item["token"] in filler_terms:
            filler_counts[item["token"]] = filler_counts.get(item["token"], 0) + 1

    repeated = 0
    for previous, current in zip(cleaned, cleaned[1:]):
        if previous["token"] == current["token"] and len(current["token"]) > 1:
            repeated += 1

    word_conf = sum(item["probability"] for item in cleaned) / len(cleaned)
    wpm = len(cleaned) / (speech_time / 60.0) if speech_time > 0 else 0.0
    filler_count = sum(filler_counts.values())
    filler_ratio = filler_count / len(cleaned)

    pace_score = 100.0 if 110 <= wpm <= 170 else (
        clamp(70.0 + (wpm / 110.0) * 30.0, 0.0, 100.0) if wpm < 110
        else clamp(100.0 - ((wpm - 170.0) / 120.0) * 30.0, 50.0, 100.0)
    )
    pause_score = clamp(100.0 - len(pauses) * 3.0 - sum(1 for p in pauses if p >= 1.5) * 5.0, 45.0, 100.0)
    filler_score = clamp(100.0 - filler_ratio * 250.0, 45.0, 100.0)
    repetition_score = clamp(100.0 - repeated * 4.0, 60.0, 100.0)
    delivery = round(0.45 * pace_score + 0.25 * pause_score + 0.15 * filler_score + 0.15 * repetition_score, 1)

    return {
        "speakingRateWpm": round(wpm, 1),
        "speechTimeSeconds": round(speech_time, 1),
        "pauseCount": len(pauses),
        "longPauseCount": sum(1 for pause in pauses if pause >= 1.5),
        "longestPauseSeconds": round(max(pauses, default=0.0), 1),
        "fillerCount": filler_count,
        "fillers": [f"{name} ({count})" for name, count in sorted(filler_counts.items())],
        "repeatedWordCount": repeated,
        "wordConfidence": round(word_conf * 100.0, 1),
        "pronunciationProxy": round(word_conf * 100.0, 1),
        "deliveryScore": delivery,
    }


def split_sentences(text: str) -> list[str]:
    # Whisper may omit punctuation. Split on punctuation first; for a long
    # punctuation-free transcript, use safe word windows so GEC is not truncated.
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()]
    if len(parts) > 1:
        return parts
    words = text.split()
    if len(words) <= 35:
        return [text]
    return [" ".join(words[i:i + 28]) for i in range(0, len(words), 28)]


def compute_fluency(words: int, duration_seconds: float) -> float:
    if words <= 0 or duration_seconds <= 0:
        return 0.0
    wpm = words / (duration_seconds / 60.0)
    # Interview practice target band: 110-170 WPM. This is a heuristic score,
    # not a clinical or scientific fluency measurement.
    if 110 <= wpm <= 170:
        return 100.0
    if wpm < 110:
        return round(clamp(70 + (wpm / 110) * 30, 0, 100), 1)
    return round(clamp(100 - ((wpm - 170) / 120) * 30, 50, 100), 1)


def build_session_analysis(
    transcript: str,
    asr_confidence: float,
    duration: float,
    previous_weak_areas: list[str] | None = None,
    question: str = "",
    speech_metrics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sentences = split_sentences(transcript)
    analyses: list[dict[str, Any]] = []
    tense_results: list[dict[str, Any]] = []
    total_mistakes = 0

    narrative_past = False
    past_cue_pattern = r"\b(yesterday|last\s+\w+|the\s+day\s+before|\d+\s+days?\s+ago|last night|after\s+(?:lunch|dinner|breakfast)|before\s+(?:I|we|they|he|she|it))\b"

    for sentence in sentences:
        # Carry a clear completed-story context into following sentences.
        # This is what allows: "Last weekend I visited... She don't..." to be
        # interpreted as one past narrative without changing unrelated present speech.
        sentence_has_past_cue = bool(re.search(past_cue_pattern, sentence, re.IGNORECASE))
        context_for_sentence = narrative_past or sentence_has_past_cue
        sentence_tense = comprehensive_tense_analysis(sentence, inherited_past=context_for_sentence)
        tense_results.append({"sentence": sentence, **sentence_tense})
        result = analyze_text(sentence, [], past_context=context_for_sentence)
        if result.get("hasIssue") and float(result.get("confidence", 0)) >= 0.85:
            # Keep ONE analysis card per spoken sentence. The card contains
            # allIssues, so the UI can teach every individual correction while
            # still showing the complete "You said -> Better version" sentence.
            analyses.append(result)
            total_mistakes += int(result.get("issueCount", 1))

        # Once a sentence clearly establishes a completed-story cue, carry it
        # forward until the paragraph ends. A present-time marker in a later
        # sentence can explicitly reset the context.
        if sentence_has_past_cue:
            narrative_past = True
        elif re.search(r"\b(today|tomorrow|every\s+day|usually|currently|now)\b", sentence, re.IGNORECASE):
            narrative_past = False

    communication = build_communication_feedback(
        transcript=transcript,
        corrected_transcript=transcript,
        analyses=analyses,
        sentences=sentences,
        asr_confidence=asr_confidence,
        duration=duration,
        question=question,
        speech_metrics=speech_metrics,
    )

    weak_areas = list(dict.fromkeys(communication["weakAreas"]))
    for area in previous_weak_areas or []:
        area = normalize_text(str(area))
        if area and area not in weak_areas:
            weak_areas.append(area)

    # Feed the merged profile back into the adaptive engine so the next
    # recommendation is personalized using both this session and prior sessions.
    communication["weakAreas"] = weak_areas
    communication["adaptivePractice"] = build_adaptive_practice_plan(
        weak_areas,
        communication["scores"],
        communication.get("relevance", {}),
    )

    words = word_count(transcript)
    grammar_score = communication["scores"]["grammar"]
    primary = analyses[0] if analyses else no_issue(transcript)
    tense_counts = {"present": 0, "past": 0, "future": 0, "present perfect": 0, "past perfect": 0, "continuous": 0}
    for item in tense_results:
        dominant = item.get("dominant", "present")
        if dominant in tense_counts:
            tense_counts[dominant] += 1

    return {
        "transcript": transcript,
        "analysis": primary,
        "analyses": analyses,
        "weakAreas": weak_areas,
        "tenseAnalysis": {"sentences": tense_results, "counts": tense_counts},
        "communication": communication,
        "stats": {
            "words": words,
            "sentences": len(sentences),
            "mistakes": total_mistakes,
            "grammarScore": grammar_score,
            "tenseCounts": tense_counts,
            "accuracy": grammar_score,
            "meaningScore": communication["scores"]["meaning"],
            "coherenceScore": communication["scores"]["coherence"],
            "vocabularyScore": communication["scores"]["vocabulary"],
            "clarityScore": communication["scores"]["clarity"],
            "fluencyScore": communication["scores"]["fluency"],
            "deliveryScore": communication["scores"].get("delivery", 0.0),
            "pronunciationProxy": communication["scores"].get("pronunciationProxy", 0.0),
            "structureScore": communication["scores"].get("structure"),
            "communicationScore": communication["scores"]["overallCommunication"],
            "confidence": round(asr_confidence * 100.0, 1),
            "durationSeconds": round(duration, 1),
        },
    }


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": APP_NAME,
        "version": APP_VERSION,
        "status": "running",
        "device": DEVICE,
        "whisper_model": WHISPER_MODEL_NAME,
        "whisper_device": WHISPER_DEVICE,
        "whisper_compute_type": WHISPER_COMPUTE_TYPE,
        "grammar_model": MODEL_PATH,
        "semantic_model": SEMANTIC_MODEL_PATH if Path(SEMANTIC_MODEL_PATH).exists() else SEMANTIC_MODEL_NAME,
        "semantic_model_loaded": semantic_model is not None,
        "endpoints": {
            "health": "GET /health",
            "analyze": "POST /analyze",
            "transcribe": "POST /transcribe",
            "audio_analyze": "POST /analyze-audio",
        },
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": APP_NAME,
        "version": APP_VERSION,
        "device": DEVICE,
        "whisper_model": WHISPER_MODEL_NAME,
        "whisper_device": WHISPER_DEVICE,
        "whisper_compute_type": WHISPER_COMPUTE_TYPE,
        "grammar_model": MODEL_PATH,
        "grammar_model_loaded": gec_model is not None,
        "whisper_model_loaded": whisper_model is not None,
        "semantic_model": SEMANTIC_MODEL_PATH if Path(SEMANTIC_MODEL_PATH).exists() else SEMANTIC_MODEL_NAME,
        "semantic_model_loaded": semantic_model is not None,
    }


@app.post("/analyze", response_model=None)
def analyze(request: AnalyzeRequest) -> dict[str, Any]:
    transcript = normalize_text(request.transcript)
    if len(transcript) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail="Transcript is too long.")
    return analyze_text(transcript, request.previousWeakAreas)


async def save_upload(audio: UploadFile) -> tuple[str, str]:
    contents = await audio.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Audio file is empty.")
    if len(contents) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=413, detail="Audio file is larger than 15 MB.")
    suffix = Path(audio.filename or "speech.webm").suffix.lower() or ".webm"
    if suffix not in {".webm", ".mp4", ".m4a", ".wav", ".ogg"}:
        suffix = ".webm"
    temp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        temp.write(contents)
        temp.close()
    except Exception:
        temp.close()
        try:
            os.remove(temp.name)
        except OSError:
            pass
        raise
    return temp.name, suffix


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)) -> dict[str, Any]:
    temp_path, _ = await save_upload(audio)
    try:
        transcript, confidence, duration, _, _speech_metrics = transcribe_audio(temp_path)
        return {
            "transcript": transcript,
            "confidence": round(confidence * 100.0, 1),
            "durationSeconds": round(duration, 1),
        }
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


@app.post("/analyze-audio")
async def analyze_audio(
    audio: UploadFile = File(...),
    userId: str | None = None,
    previousWeakAreas: str | None = None,
    question: str | None = None,
) -> dict[str, Any]:
    temp_path, _ = await save_upload(audio)
    try:
        transcript, confidence, duration, _, speech_metrics = transcribe_audio(temp_path)
        if not transcript:
            empty = no_issue("")
            return {
                "transcript": "",
                "analysis": empty,
                "analyses": [],
                "weakAreas": [],
                "stats": {
                    "words": 0,
                    "sentences": 0,
                    "mistakes": 0,
                    "accuracy": 100.0,
                    "grammarScore": 100.0,
                    "meaningScore": 0.0,
                    "coherenceScore": 0.0,
                    "vocabularyScore": 0.0,
                    "clarityScore": 0.0,
                    "fluencyScore": 0.0,
                    "deliveryScore": 0.0,
                    "pronunciationProxy": 0.0,
                    "communicationScore": 0.0,
                    "confidence": 0.0,
                    "durationSeconds": round(duration, 1),
                },
            }
        previous: list[str] = []
        interview_question = normalize_text(question or "")[:1000]
        if previousWeakAreas:
            try:
                parsed = json.loads(previousWeakAreas)
                if isinstance(parsed, list):
                    previous = [str(item) for item in parsed if str(item).strip()]
            except Exception:
                previous = []
        return build_session_analysis(transcript, confidence, duration, previous, interview_question, speech_metrics)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Audio analysis failed")
        raise HTTPException(status_code=500, detail=f"Speaking ML analysis failed: {exc}") from exc
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn
    # IMPORTANT: pass the app object, not "app:app". This file can therefore
    # safely be named app.py, app_speaking_fixed.py, or another filename.
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)
