import importlib.util
import sys
import types
from pathlib import Path

# The smoke test exercises the pure logic without requiring the heavy ML
# packages to be installed in the test runner.
transformers = types.ModuleType("transformers")
transformers.AutoTokenizer = object
transformers.AutoModelForSeq2SeqLM = object
sys.modules["transformers"] = transformers

faster_whisper = types.ModuleType("faster_whisper")
faster_whisper.WhisperModel = object
sys.modules["faster_whisper"] = faster_whisper

APP = Path(__file__).resolve().parents[1] / "ml-service" / "app.py"
spec = importlib.util.spec_from_file_location("interviewarena_app", APP)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def expect(original, expected, issue_count=None):
    result = module.deterministic_correction(original)
    assert result is not None, original
    assert result["corrected"] == expected, (original, result["corrected"], expected)
    if issue_count is not None:
        assert result["issueCount"] == issue_count, result


expect("Yesterday I go to temple to see God.", "Yesterday I went to temple to see God.", 1)
expect(
    "Last weekend, I visit my grandmother because she was feeling lonely and I want to spend some time with her.",
    "Last weekend, I visited my grandmother because she was feeling lonely and I wanted to spend some time with her.",
    2,
)
expect("I enjoy to play cricket with my friends.", "I enjoy playing cricket with my friends.", 1)
paragraph = "Yesterday I went to college because I want to meet my friend. She don't understand what I was saying."
paragraph_result = module.build_session_analysis(paragraph, 0.95, 10.0)
assert paragraph_result["stats"]["mistakes"] == 2, paragraph_result["stats"]
assert any("She didn't understand" in a["corrected"] for a in paragraph_result["analyses"])
expect("She go to college every day and she study very hard.", "She goes to college every day and she studies very hard.", 2)
expect("She gave me many advice about my future career.", "She gave me a lot of advice about my future career.", 1)
expect(
    "Before I leave, she tells me that she is very happy because I was spent the whole day with her.",
    "Before I left, she told me that she is very happy because I spent the whole day with her.",
    3,
)
assert module.deterministic_correction("Yesterday I went to college and studied hard.") is None

metrics = module.build_speech_metrics(
    [
        {"word": "hello", "start": 0.0, "end": 0.4, "probability": 0.95},
        {"word": "world", "start": 1.3, "end": 1.7, "probability": 0.90},
        {"word": "world", "start": 1.8, "end": 2.2, "probability": 0.88},
    ],
    [],
    2.2,
)
assert metrics["pauseCount"] == 1
assert metrics["repeatedWordCount"] == 1
assert metrics["pronunciationProxy"] > 0

relevance = module.interview_relevance(
    "Tell me about a meaningful experience with your family.",
    "Last weekend, I visited my grandmother because she was feeling lonely.",
)
assert relevance["available"] is True
assert relevance["score"] >= 50

structure = module.interview_structure_analysis(
    "Explain your project.",
    "My project solves a problem. I implemented it using Python. For example, it reduced processing time.",
    "project explanation",
)
assert structure["available"] is True
assert structure["score"] > 0

plan = module.build_adaptive_practice_plan(
    ["Past tense consistency", "Speech delivery", "Answer relevance"],
    {"fluency": 70},
    relevance,
)
assert len(plan) >= 3

print("InterviewArena Speaking Coach logic smoke tests: PASS")

# Multi-error regression: the engine must keep correcting after one fix creates
# another auxiliary/verb-form dependency. This case contains 20 independent
# correction events across five sentences.
multi = "Yesterday I go to college and I doesn't attend my class because my friends was waiting for me and they don't knew that I have complete my assignment. Tomorrow I went to the market and I will going there again because she can went with me. He have saw the teacher and she have gave him many advice. I am agree with him and he don't likes this idea. We was more better prepared and they enjoys to practice coding."
parts = module.split_sentences(multi)
context = False
total = 0
for sentence in parts:
    result = module.deterministic_correction(sentence, past_context=context)
    if result:
        total += result["issueCount"]
    if __import__("re").search(r"\b(yesterday|last\s+\w+|ago)\b", sentence, __import__("re").I):
        context = True
assert total == 20, total

