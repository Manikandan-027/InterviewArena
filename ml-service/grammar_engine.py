from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("\n", " ")).strip()


def compare_text(text: str) -> str:
    return re.sub(r"[.!?,;:]+$", "", normalize_text(text)).lower().strip()


def word_tokens(text: str) -> list[str]:
    return re.findall(r"\b[\w'-]+\b", text.lower())


def edit_objects(original: str, corrected: str) -> list[dict[str, str]]:
    old, new = original.split(), corrected.split()
    result: list[dict[str, str]] = []
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, old, new).get_opcodes():
        if tag != "equal":
            result.append({
                "operation": "replace" if tag == "replace" else "remove" if tag == "delete" else "insert",
                "original": " ".join(old[i1:i2]),
                "corrected": " ".join(new[j1:j2]),
            })
    return result


def tense_analysis(text: str, inherited_past: bool = False) -> dict[str, Any]:
    """Conservative sentence-level tense analysis. It reports cues and the dominant narrative tense."""
    low = text.lower()
    cues: list[str] = []
    if re.search(r"\b(yesterday|last\s+(?:night|week|weekend|month|year)|\d+\s+days?\s+ago|the\s+day\s+before|earlier|previously|after\s+(?:lunch|dinner|breakfast))\b", low):
        cues.append("past")
    if re.search(r"\b(tomorrow|next\s+(?:week|weekend|month|year)|in\s+\d+\s+days?|later|soon)\b", low):
        cues.append("future")
    if re.search(r"\b(now|currently|today|usually|often|always|every\s+(?:day|week|month)|generally)\b", low):
        cues.append("present")
    if re.search(r"\b(?:have|has)\s+\w+(?:ed|en)\b", low):
        cues.append("present perfect")
    if re.search(r"\bhad\s+\w+(?:ed|en)\b", low):
        cues.append("past perfect")
    if re.search(r"\b(?:will|shall)\s+(?:have\s+)?\w+\b", low):
        cues.append("future")
    if re.search(r"\b(?:am|is|are|was|were)\s+\w+ing\b", low):
        cues.append("continuous")

    if "future" in cues and "past" not in cues:
        dominant = "future"
    elif "past" in cues or inherited_past:
        dominant = "past"
    elif "present perfect" in cues:
        dominant = "present perfect"
    elif "past perfect" in cues:
        dominant = "past perfect"
    else:
        dominant = "present"
    return {"dominant": dominant, "cues": list(dict.fromkeys(cues)), "inheritedPast": inherited_past}


IRREGULAR = {
    "go": "went", "come": "came", "see": "saw", "eat": "ate", "take": "took",
    "make": "made", "get": "got", "give": "gave", "find": "found", "have": "had",
    "do": "did", "write": "wrote", "speak": "spoke", "run": "ran", "buy": "bought",
    "meet": "met", "teach": "taught", "feel": "felt", "spend": "spent", "tell": "told",
    "leave": "left", "say": "said", "understand": "understood", "know": "knew",
    "think": "thought", "bring": "brought", "build": "built", "choose": "chose",
    "drink": "drank", "drive": "drove", "fall": "fell", "forget": "forgot",
    "hear": "heard", "keep": "kept", "lose": "lost", "read": "read", "send": "sent",
    "sit": "sat", "sleep": "slept", "stand": "stood", "swim": "swam", "win": "won",
    "begin": "began", "break": "broke", "cut": "cut", "put": "put", "let": "let",
}

BASE_VERBS = set(IRREGULAR) | {
    "visit", "want", "need", "decide", "return", "discuss", "study", "work", "play", "like",
    "help", "open", "close", "start", "finish", "call", "ask", "answer", "use", "learn",
    "watch", "talk", "walk", "live", "love", "plan", "join", "try", "explain", "prepare",
    "practice", "complete", "develop", "create", "design", "test", "solve", "improve", "apply",
    "attend", "enjoy", "prefer", "remember", "believe", "want", "need", "show", "tell", "work",
}


def past_form(v: str) -> str:
    if v in IRREGULAR:
        return IRREGULAR[v]
    if v.endswith("e"):
        return v + "d"
    if v.endswith("y") and len(v) > 1 and v[-2] not in "aeiou":
        return v[:-1] + "ied"
    return v + "ed"


def third_person(v: str) -> str:
    if v == "have": return "has"
    if v == "do": return "does"
    if v == "go": return "goes"
    if v.endswith("y") and len(v) > 1 and v[-2] not in "aeiou": return v[:-1] + "ies"
    if v.endswith(("s", "sh", "ch", "x", "z", "o")): return v + "es"
    return v + "s"


def perfect_participle(v: str) -> str:
    special = {
        "go": "gone", "come": "come", "see": "seen", "eat": "eaten", "take": "taken",
        "make": "made", "get": "gotten", "give": "given", "find": "found", "do": "done",
        "write": "written", "speak": "spoken", "run": "run", "buy": "bought", "meet": "met",
        "teach": "taught", "feel": "felt", "spend": "spent", "tell": "told", "leave": "left",
        "say": "said", "understand": "understood", "know": "known", "think": "thought",
        "bring": "brought", "build": "built", "choose": "chosen", "drink": "drunk", "drive": "driven",
        "fall": "fallen", "forget": "forgotten", "hear": "heard", "keep": "kept", "lose": "lost",
        "read": "read", "send": "sent", "sit": "sat", "sleep": "slept", "stand": "stood", "swim": "swum",
        "win": "won", "begin": "begun", "break": "broken", "cut": "cut", "put": "put", "let": "let",
    }
    return special.get(v, past_form(v))


def deterministic_correction(text: str, past_context: bool = False) -> dict[str, Any] | None:
    current = normalize_text(text)
    issues: list[dict[str, Any]] = []

    def record(before: str, after: str, reason: str, area: str, severity: str = "important"):
        if compare_text(before) == compare_text(after):
            return
        edits = edit_objects(before, after)
        if not edits:
            return
        issues.append({
            "hasIssue": True, "confidence": 0.99, "original": before, "corrected": after,
            "reason": reason, "weakArea": area, "category": "grammar", "severity": severity, "edits": edits,
        })

    def rule(pattern: str, repl: str | Any, reason: str, area: str = "Grammar", severity: str = "important") -> bool:
        nonlocal current
        m = re.search(pattern, current, re.I)
        if not m:
            return False
        after = re.sub(pattern, repl, current, count=1, flags=re.I)
        if compare_text(after) == compare_text(current):
            return False
        before = current
        current = after
        record(before, after, reason, area, severity)
        return True

    # 1. Modal/auxiliary + wrong verb form. These are very high confidence and
    # must run before narrative tense rules.
    for aux in ("can", "could", "may", "might", "must", "should", "would", "will", "shall"):
        for base in BASE_VERBS:
            past = IRREGULAR.get(base, past_form(base))
            while rule(rf"\b{aux}\s+{re.escape(past)}\b", f"{aux} {base}",
                       f"After '{aux}', use the base form '{base}', not the past form '{past}'.", "Verb forms"):
                pass
            while rule(rf"\b{aux}\s+{re.escape(base)}ing\b", f"{aux} {base}",
                       f"After '{aux}', use the base verb '{base}'.", "Verb forms"):
                pass

    # 2. did/didn't + past form -> base form.
    for base in BASE_VERBS:
        past = IRREGULAR.get(base, past_form(base))
        for aux in ("did", "didn't", "didn’t"):
            while rule(rf"\b{aux}\s+{re.escape(past)}\b", f"{aux} {base}",
                       f"After '{aux}', use the base verb '{base}', not '{past}'.", "Verb forms"):
                pass

    # 3. Perfect auxiliaries + wrong past form -> participle.
    for base in BASE_VERBS:
        past = IRREGULAR.get(base, past_form(base))
        pp = perfect_participle(base)
        for aux in ("have", "has", "had"):
            while rule(rf"\b{aux}\s+{re.escape(past)}\b", f"{aux} {pp}",
                       f"After '{aux}', use the past participle '{pp}'.", "Perfect tenses"):
                pass

    # 4. Future 'will + going' / 'will + past'.
    while rule(r"\bwill\s+be\s+went\b", "will be going", "The future continuous uses 'will be + -ing'.", "Future tense"):
        pass
    while rule(r"\bwill\s+going\b", "will go", "After 'will', use the base verb: 'will go'.", "Future tense"):
        pass

    # 5. Clear future time cues + simple present finite verb. Use only a broad,
    # known verb vocabulary to avoid damaging legitimate timetable statements.
    future_cue = r"\b(tomorrow|next\s+(?:week|weekend|month|year)|in\s+\d+\s+days?)\b"
    for base in BASE_VERBS:
        third = third_person(base)
        for subject in ("I", "we", "they", "you", "he", "she", "it"):
            for form in (base, third):
                while rule(rf"{future_cue}([^.!?]{{0,30}}?)\b{re.escape(subject)}\s+{re.escape(form)}\b",
                           lambda m, s=subject: m.group(0).replace(m.group(0).split()[-1], "will " + base),
                           f"The time expression indicates the future; use 'will {base}'.", "Future tense"):
                    pass

    # 6. Past negative and past affirmative context. A paragraph-level past
    # context is strong enough to repair an auxiliary error such as
    # "she don't understand" -> "she didn't understand". For affirmative
    # verbs, however, inherited context alone is not enough: "I want" may
    # intentionally describe a current desire inside a past story. We therefore
    # require an explicit past cue in the SAME sentence for affirmative rewrites.
    explicit_past_cue = bool(re.search(
        r"\b(yesterday|last\s+(?:night|week|weekend|month|year)|the\s+day\s+before|\d+\s+days?\s+ago|after\s+(?:lunch|dinner|breakfast)|earlier|previously)\b",
        current, re.I))
    past_signal = past_context or explicit_past_cue
    if past_signal:
        while rule(r"\b(he|she|it|I|we|they|you)\s+(?:do|does)n['’]t\s+([a-z]+)\b",
                   lambda m: f"{m.group(1)} didn't {m.group(2)}",
                   "This is part of a completed past narrative, so use 'didn't + base verb'.", "Past tense"):
            pass
    if explicit_past_cue:
        for base in BASE_VERBS:
            present = base
            third = third_person(base)
            past = IRREGULAR.get(base, past_form(base))
            for subject in ("I", "we", "they", "you", "he", "she", "it"):
                for form in set((present, third)):
                    while rule(rf"\b{subject}\s+{re.escape(form)}\b", f"{subject} {past}",
                               f"The sentence contains a completed-past time cue, so use '{past}' instead of '{form}'.", "Past tense"):
                        pass

    # 6b. Narrative-story forms that are unambiguous when a completed
    # event is explicitly introduced by "Before ...".
    while rule(r"\bBefore\s+(I|we|they|he|she|it)\s+leave\b", lambda m: f"Before {m.group(1)} left",
               "This completed story uses the past form 'left' after 'Before'.", "Past tense"):
        pass
    while rule(r"\b(he|she|it)\s+tells\b", lambda m: f"{m.group(1)} told",
               "The surrounding completed story calls for the past form 'told'.", "Past tense"):
        pass
    while rule(r"\bI\s+was\s+spent\b", "I spent",
               "Use 'I spent' when 'spent' is the main verb; 'was spent' would be a different passive construction.", "Verb form"):
        pass

    # 7. Be agreement, present and past.
    be_rules = [
        (r"\bI\s+(?:is|are)\b", "I am", "Use 'am' with 'I'."),
        (r"\b(he|she|it)\s+are\b", r"\1 is", "Use 'is' with a singular third-person subject."),
        (r"\b(we|they|you)\s+is\b", r"\1 are", "Use 'are' with 'we', 'they', or 'you'."),
        (r"\bI\s+(?:was|were)\b", "I was", "Use 'was' with 'I' in the simple past."),
        (r"\b(he|she|it)\s+were\b", r"\1 was", "Use 'was' with a singular third-person subject."),
        (r"\b(we|they|you)\s+was\b", r"\1 were", "Use 'were' with 'we', 'they', or 'you'."),
    ]
    for pat, repl, why in be_rules:
        while rule(pat, repl, why, "Subject-verb agreement"):
            pass

    # 8. Common copular stative errors.
    stative = {"agree": "agree", "understand": "understand", "know": "know", "believe": "believe", "want": "want", "need": "need", "like": "like"}
    for v, base in stative.items():
        while rule(rf"\b(I|we|they|you|he|she|it)\s+(?:am|is|are)\s+{v}\b", lambda m, b=base: f"{m.group(1)} {third_person(b) if m.group(1).lower() in {'he','she','it'} else b}",
                   f"'{v}' is normally used as a main verb here, not after 'be'.", "Verb form"):
            pass

    # 9. Present simple third-person agreement. Known vocabulary keeps this safe.
    for base in BASE_VERBS:
        if base in {"have", "do", "go"}:
            continue
        third = third_person(base)
        while rule(rf"\b(he|she|it)\s+{re.escape(base)}\b", rf"\1 {third}",
                   f"A singular third-person subject needs '{third}' in the simple present.", "Subject-verb agreement"):
            pass

    # 10. Negative present agreement: he/she/it don't -> doesn't.
    while rule(r"\b(he|she|it)\s+don't\b", r"\1 doesn't", "Use 'doesn't' with he, she, or it in the simple present.", "Subject-verb agreement"):
        pass

    # 11. Articles and determiners.
    vowel_sound = r"apple|application|engineer|exam|interview|idea|issue|hour|honest|umbrella|AI|MBA"
    while rule(rf"\ba\s+({vowel_sound})\b", r"an \1", "Use 'an' before a vowel sound.", "Articles"):
        pass
    while rule(r"\ban\s+(university|user|European|useful)\b", r"a \1", "These words begin with a consonant sound, so use 'a'.", "Articles"):
        pass

    # 12. Countable/uncountable nouns.
    noun_rules = [
        (r"\b(?:many|a|an)\s+advice\b", "a lot of advice"),
        (r"\b(?:many|a|an)\s+information\b", "a lot of information"),
        (r"\b(?:many|a|an)\s+furniture\b", "a lot of furniture"),
        (r"\b(?:many|a|an)\s+equipment\b", "a lot of equipment"),
        (r"\b(?:many|a|an)\s+knowledge\b", "a lot of knowledge"),
    ]
    for pat, repl in noun_rules:
        while rule(pat, repl, "This noun is normally uncountable; use a quantity expression such as 'a lot of'.", "Countability"):
            pass

    # 13. High-confidence verb-pattern and preposition errors.
    verb_patterns = [
        (r"\benjoy\s+to\s+(\w+)", lambda m: f"enjoy {m.group(1)}ing", "'Enjoy' is followed by an -ing form.", "Verb patterns"),
        (r"\bdiscuss(?:ed)?\s+about\b", lambda m: "discussed" if m.group(0).lower().startswith("discussed") else "discuss", "'Discuss' takes its object directly; do not add 'about'.", "Prepositions"),
        (r"\binterested\s+on\b", "interested in", "The standard expression is 'interested in'.", "Prepositions"),
        (r"\bgood\s+in\b", "good at", "For ability, use 'good at'.", "Prepositions"),
        (r"\bafraid\s+from\b", "afraid of", "The standard expression is 'afraid of'.", "Prepositions"),
        (r"\bdepend\s+of\b", "depend on", "The standard expression is 'depend on'.", "Prepositions"),
    ]
    for pat, repl, why, area in verb_patterns:
        while rule(pat, repl, why, area):
            pass

    # 14. Destination prepositions.
    for verb in ("go", "went", "goes", "travel", "traveled", "travelled"):
        while rule(rf"\b{verb}\s+(the\s+)?(temple|school|college|market|office|park|church|hospital|station|university|company)\b",
                   lambda m, v=verb: f"{v} to {m.group(1) or ''}{m.group(2)}",
                   "Use 'to' when expressing movement to a destination.", "Prepositions"):
            pass

    # 15. Comparatives/superlatives.
    comparisons = [
        (r"\bmore\s+better\b", "better"), (r"\bmore\s+worse\b", "worse"),
        (r"\bmore\s+best\b", "best"), (r"\bmost\s+best\b", "best"),
        (r"\bmost\s+easiest\b", "easiest"), (r"\bmore\s+easier\b", "easier"),
    ]
    for pat, repl in comparisons:
        while rule(pat, repl, "Do not use two comparative or superlative markers together.", "Comparatives and superlatives"):
            pass

    # 16. Final normalization pass. Earlier corrections can create a new
    # auxiliary/verb-form error (for example don't + knew -> didn't + knew).
    # Re-run the high-confidence auxiliary rules AFTER every tense rewrite.
    for base in BASE_VERBS:
        past = IRREGULAR.get(base, past_form(base))
        pp = perfect_participle(base)
        for aux in ("did", "didn't", "didn’t"):
            while rule(rf"\b{aux}\s+{re.escape(past)}\b", f"{aux} {base}",
                       f"After '{aux}', use the base verb '{base}', not '{past}'.", "Verb forms"):
                pass
        for aux in ("did", "didn't", "didn’t"):
            third = third_person(base)
            while rule(rf"\b{aux}\s+{re.escape(third)}\b", f"{aux} {base}",
                       f"After '{aux}', use the base verb '{base}', not the third-person form '{third}'.", "Verb forms"):
                pass
        for aux in ("have", "has", "had"):
            while rule(rf"\b{aux}\s+{re.escape(base)}\b", f"{aux} {pp}",
                       f"After '{aux}', use the past participle '{pp}'.", "Perfect tenses"):
                pass

    # 'enjoy' takes a gerund even when it is in the past tense.
    gerund_special = {
        "play": "playing", "go": "going", "eat": "eating", "watch": "watching",
        "read": "reading", "learn": "learning", "study": "studying", "work": "working",
        "travel": "travelling", "write": "writing", "speak": "speaking", "cook": "cooking",
        "practice": "practicing", "help": "helping", "run": "running", "swim": "swimming",
    }
    for base, ing in gerund_special.items():
        while rule(rf"\benjoy(?:ed|s)?\s+to\s+{re.escape(base)}\b",
                   lambda m, b=base, g=ing: ("enjoyed " + g if m.group(0).lower().startswith("enjoyed") else "enjoy " + g),
                   "'Enjoy' is followed by an -ing form, not 'to + verb'.", "Verb patterns"):
            pass

    # If a future cue explicitly introduces a finite clause, repair the tense.
    # This is deliberately narrow: it does not rewrite general present-tense
    # statements merely because a word such as 'next' occurs elsewhere.
    future_patterns = []
    for base in BASE_VERBS:
        future_patterns.extend([
            (rf"\b(tomorrow|next\s+(?:week|weekend|month|year))\s+(I|we|they|you|he|she|it)\s+{re.escape(IRREGULAR.get(base, past_form(base)))}\b",
             lambda m, b=base: f"{m.group(1)} {m.group(2)} will {b}"),
            (rf"\b(tomorrow|next\s+(?:week|weekend|month|year))\s+(I|we|they|you|he|she|it)\s+{re.escape(third_person(base))}\b",
             lambda m, b=base: f"{m.group(1)} {m.group(2)} will {b}"),
        ])
    for pat, repl in future_patterns:
        while rule(pat, repl, "The time expression explicitly refers to the future, so use 'will + base verb'.", "Future tense"):
            pass

    # Final present agreement pass catches forms created by other repairs.
    for base in BASE_VERBS:
        third = third_person(base)
        while rule(rf"\b(he|she|it)\s+{re.escape(base)}\b", rf"\1 {third}",
                   f"A singular third-person subject needs '{third}' in the simple present.", "Subject-verb agreement"):
            pass

    # 16. Double adjacent words.
    while rule(r"\b([A-Za-z]+)\s+\1\b", r"\1", "The same word is unnecessarily repeated.", "Word repetition", "minor"):
        pass

    if not issues:
        return None
    primary = dict(issues[0])
    primary["allIssues"] = issues
    primary["issueCount"] = len(issues)
    primary["corrected"] = current
    primary["edits"] = edit_objects(text, current)
    primary["reason"] = " ".join(x["reason"] for x in issues)
    primary["weakArea"] = ", ".join(dict.fromkeys(x["weakArea"] for x in issues))
    primary["tense"] = tense_analysis(text, past_context)
    return primary
