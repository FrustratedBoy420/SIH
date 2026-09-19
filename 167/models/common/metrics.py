"""Scoring a VQA run, and saying honestly what was scored.

VRSBench answers are short — a word, a number, a phrase. The published anchors
(GeoChat 60.6 %, GPT-4V 65.6 %) are exact-match accuracy after light
normalisation, so that is the headline metric here.

A lenient "contains" score is computed alongside it, because the gap between
the two is diagnostic: a large gap means the model knows the answer but is
phrasing it conversationally, which is a prompting problem, not a knowledge
problem. It is reported as a separate, labelled row and is **never** the number
quoted as accuracy. `docs/10_Decision_Record.md` section 9: report what was
measured, and a metric measured on its own construction is not a metric.
"""

from __future__ import annotations

import re
import string
from collections import defaultdict
from dataclasses import dataclass, field

ARTICLES = {"a", "an", "the"}

NUMBER_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12",
}

_PUNCT = str.maketrans("", "", string.punctuation)


def normalise(text: str) -> str:
    """Lowercase, strip punctuation and articles, spell out digits consistently.

    Deliberately light. Aggressive normalisation inflates accuracy by mapping
    wrong answers onto right ones, and an inflated baseline shrinks the
    adaptation gain that requirement 1 is evidenced by.
    """
    text = text.lower().strip()
    text = text.translate(_PUNCT)
    tokens = [NUMBER_WORDS.get(t, t) for t in text.split() if t not in ARTICLES]
    return re.sub(r"\s+", " ", " ".join(tokens)).strip()


def exact(prediction: str, truth: str) -> bool:
    return normalise(prediction) == normalise(truth)


def contains(prediction: str, truth: str) -> bool:
    """Lenient: is the gold answer present as a whole token run in the output?"""
    gold = normalise(truth)
    pred = normalise(prediction)
    if not gold:
        return False
    return re.search(rf"(?<!\w){re.escape(gold)}(?!\w)", pred) is not None


@dataclass
class Score:
    total: int = 0
    correct: int = 0
    lenient: int = 0
    by_type: dict[str, list[int]] = field(default_factory=lambda: defaultdict(lambda: [0, 0]))

    def add(self, prediction: str, truth: str, qtype: str = "unspecified") -> bool:
        hit = exact(prediction, truth)
        self.total += 1
        self.correct += hit
        self.lenient += contains(prediction, truth)
        bucket = self.by_type[qtype]
        bucket[0] += hit
        bucket[1] += 1
        return hit

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0

    @property
    def lenient_accuracy(self) -> float:
        return self.lenient / self.total if self.total else 0.0

    def as_dict(self) -> dict:
        return {
            "n": self.total,
            "accuracy_exact": round(self.accuracy, 4),
            "accuracy_lenient": round(self.lenient_accuracy, 4),
            "by_type": {
                qtype: {
                    "n": n,
                    "accuracy_exact": round(hits / n, 4) if n else 0.0,
                }
                for qtype, (hits, n) in sorted(self.by_type.items())
            },
        }


def report(score: Score, anchors: dict[str, float] | None = None) -> str:
    """A printable block. Per-category, because specification section 14 asks
    for it and because an overall number hides which capability is weak."""
    lines = [
        "",
        f"  items scored        {score.total:,}",
        f"  accuracy (exact)    {score.accuracy:.4f}   <- report THIS",
        f"  accuracy (lenient)  {score.lenient_accuracy:.4f}   (diagnostic only)",
        "",
        "  by question type",
    ]
    for qtype, (hits, n) in sorted(score.by_type.items(), key=lambda kv: -kv[1][1]):
        lines.append(f"    {qtype:<24} {hits / n if n else 0:.4f}   n={n:,}")

    if anchors:
        lines += ["", "  published anchors (VRSBench VQA)"]
        for name, value in anchors.items():
            lines.append(f"    {name:<24} {value:.4f}")

    gap = score.lenient_accuracy - score.accuracy
    if gap > 0.10:
        lines += [
            "",
            f"  NOTE: lenient exceeds exact by {gap:.3f}. The model is answering",
            "  correctly but verbosely. Check the short-answer instruction is",
            "  reaching the prompt before concluding the base model is weak.",
        ]
    return "\n".join(lines)
