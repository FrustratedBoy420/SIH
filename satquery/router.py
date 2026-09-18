"""The agentic router — the component the problem statement calls the novelty.

    "The novelty of SatQuery AI lies in its agentic, query-driven framework.
     Instead of applying a single generic VLM, the system selects and executes
     suitable remote-sensing specialist models, validates inputs, combines
     their outputs, and returns an evidence-grounded response."

Five jobs, in strict order:

    1  classify the task from the query
    2  validate the inputs against what that task requires
    3  select tools from a PREDEFINED registry — never invent one
    4  sequence them
    5  execute with permitted parameters only

Step 2 is the one most implementations skip, and it is explicitly required:
*"check the number, modality, format, metadata, and compatibility of the input
images"*. A router that skips it runs the change model on a duplicated image
and returns a confident, meaningless answer.

Deliberately a plain function, not an agent framework — see ADR-004. The
requirement here is constraint, not capability.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Any, Literal

from .raster import Raster

Task = Literal["single_vqa", "grounding", "temporal_change", "cross_modal", "unknown"]
Modality = Literal["single", "bi_temporal", "optical_sar", "none"]


# --------------------------------------------------------------------------- #
# tool registry — the agent selects from this and nothing else
# --------------------------------------------------------------------------- #

REGISTRY: dict[str, dict[str, Any]] = {
    "rs_vqa": {
        "tasks": ["single_vqa"],
        "requires": "single",
        "accepts": ["optical", "sar"],
        "outputs": ["text", "confidence"],
        "adapter": "adapter_A_rs_general",
        "params": {"threshold": (0.0, 1.0, 0.45)},
        "description": "Remote-sensing visual question answering.",
    },
    "grounding": {
        "tasks": ["grounding"],
        "requires": "single",
        "accepts": ["optical", "sar"],
        "outputs": ["boxes", "confidence"],
        "adapter": "adapter_B_grounding",
        "params": {"threshold": (0.0, 1.0, 0.45)},
        "description": "Text-guided region grounding, returning georeferenced boxes.",
    },
    "change_vqa": {
        "tasks": ["temporal_change"],
        "requires": "bi_temporal",
        "accepts": ["optical", "sar"],
        "outputs": ["text", "change_regions", "confidence"],
        "adapter": "adapter_C_change",
        "params": {"threshold": (0.0, 1.0, 0.45)},
        "description": "Change detection and change VQA over a bi-temporal pair.",
    },
    "optical_sar": {
        "tasks": ["cross_modal"],
        "requires": "optical_sar",
        "accepts": ["optical", "sar"],
        "outputs": ["text", "evidence", "confidence"],
        "adapter": "fusion_late_v0",
        "params": {"threshold": (0.0, 1.0, 0.45)},
        "description": "Complementary extraction from a co-registered optical-SAR pair.",
    },
}

PERMITTED_PARAMS = {"threshold"}     # the agent may configure these and no others

# Which supplied modalities SATISFY each requirement.
#
# This is a superset relation, not equality, and getting it wrong is worse than
# having no validation at all. A single-image task is satisfiable by a pair —
# asking "highlight the water body" while an optical and SAR image are both
# loaded is a perfectly ordinary request, and refusing it would make the
# validation layer look broken rather than careful.
#
# The refusal path exists for genuine impossibility: a bi-temporal question
# when no second date exists, or a cross-modal question with only one sensor.
SATISFIES: dict[str, set[str]] = {
    "single":      {"single", "optical_sar", "bi_temporal"},
    "optical_sar": {"optical_sar"},
    "bi_temporal": {"bi_temporal"},
}


# --------------------------------------------------------------------------- #
# inputs
# --------------------------------------------------------------------------- #

@dataclass
class Inputs:
    """What the user actually supplied, described so the router can reason."""

    optical: Raster | None = None
    sar: Raster | None = None
    t1: Raster | None = None
    t2: Raster | None = None

    def modality(self) -> Modality:
        if self.t1 is not None and self.t2 is not None:
            return "bi_temporal"
        if self.optical is not None and self.sar is not None:
            return "optical_sar"
        if self.optical is not None or self.sar is not None:
            return "single"
        return "none"

    def manifest(self) -> dict[str, Any]:
        def d(r: Raster | None, role: str) -> dict | None:
            if r is None:
                return None
            s = r.summary()
            s["role"] = role
            return s
        return {
            "modality": self.modality(),
            "count": sum(x is not None for x in
                         (self.optical, self.sar, self.t1, self.t2)),
            "rasters": [x for x in (d(self.optical, "optical"), d(self.sar, "sar"),
                                    d(self.t1, "t1"), d(self.t2, "t2")) if x],
        }

    def any_raster(self) -> Raster | None:
        return self.optical or self.sar or self.t1 or self.t2


# --------------------------------------------------------------------------- #
# classification
# --------------------------------------------------------------------------- #

PATTERNS: list[tuple[Task, str]] = [
    ("temporal_change", r"\b(chang(e|ed|es|ing)|differ(ence|ent)?|between these two|"
                        r"since|before and after|bi-?temporal|grew|expansion|new .*(built|construct))\b"),
    # Implicit temporal (RTR-06). "Has the built-up area increased?" names no
    # date and no second image, yet it can only be answered by comparing two.
    # A verb of change over a quantity is a temporal question; routing it to
    # single-image VQA returns a confident area that answers something else.
    ("temporal_change", r"\b(increas(e|ed|es|ing)|decreas(e|ed|es|ing)|"
                        r"grow(n|s|ing)?|shr(a|u)nk|shrink(ing|s)?|expand(ed|s|ing)?|"
                        r"reduc(e|ed|es|ing)|declin(e|ed|es|ing)|rise|risen|rose|"
                        r"fell|fallen|over time|trend|encroach(ed|ment)?|"
                        r"lost|gained|disappeared|cleared|deforest\w*)\b"),
    ("cross_modal",     r"\b(sar|radar|backscatter|both (images|sensors)|together|"
                        r"complementary|cross[- ]modal|optical and|under (the )?cloud)\b"),
    ("grounding",       r"\b(highlight|where (is|are)|show me|locate|mark|outline|"
                        r"delineate|find the|point out)\b"),
    ("single_vqa",      r"\b(how many|count|number of|is there|are there|what (type|kind)|"
                        r"describe|dominant|how much|what is)\b"),
]


def classify(query: str) -> tuple[Task, float, str]:
    """Query -> task. Returns (task, confidence, the rule that fired).

    Rule-based, and honest about it. `03_Model_Specification.md` §8 specifies a
    small trained classifier on 5-20k synthetic paraphrases; this is the
    deterministic stand-in with the same interface, so swapping it is a
    one-line change and the trace records which one ran.
    """
    q = (query or "").lower().strip()
    if not q:
        return "unknown", 0.0, "empty query"
    for task, pattern in PATTERNS:
        m = re.search(pattern, q)
        if m:
            return task, 0.86, f"matched /{m.group(0)}/"
    return "single_vqa", 0.42, "no rule matched; defaulted to single-image VQA"


# --------------------------------------------------------------------------- #
# the plan
# --------------------------------------------------------------------------- #

@dataclass
class Plan:
    valid: bool
    task: Task
    tools: list[str] = field(default_factory=list)
    params: dict[str, Any] = field(default_factory=dict)
    modality_required: str = ""
    modality_found: str = ""
    reason: str = ""
    remedy: str = ""
    task_confidence: float = 0.0
    rule: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def plan(query: str, inputs: Inputs, threshold: float = 0.45) -> Plan:
    """Classify, validate, select, sequence. Executes nothing."""
    task, conf, rule = classify(query)

    if task == "unknown":
        return Plan(False, task, reason="No query was supplied.",
                    remedy="Ask a question about the imagery.",
                    task_confidence=conf, rule=rule)

    candidates = [n for n, s in REGISTRY.items() if task in s["tasks"]]
    if not candidates:
        return Plan(False, task, reason=f"No registered tool serves {task!r}.",
                    remedy="This capability is not implemented.",
                    task_confidence=conf, rule=rule)

    tool = candidates[0]
    required = REGISTRY[tool]["requires"]
    found = inputs.modality()

    # ---- the compatibility gate ----
    if found not in SATISFIES[required]:
        return Plan(
            False, task, tools=[], modality_required=required, modality_found=found,
            reason=_explain(required, found),
            remedy=_remedy(required),
            task_confidence=conf, rule=rule)

    # ---- permitted parameters only ----
    params: dict[str, Any] = {}
    lo, hi, default = REGISTRY[tool]["params"]["threshold"]
    params["threshold"] = min(max(float(threshold), lo), hi) if threshold is not None else default

    tools = [tool]
    # sequencing: a cross-modal question that also names a target grounds it too
    if task == "cross_modal" and re.search(r"\b(where|highlight|locate|show)\b",
                                           (query or "").lower()):
        tools.append("grounding")

    detail = (f"{found} satisfies {tool}" if found == required
              else f"{found} satisfies {tool} (needs {required}; a superset was supplied)")
    return Plan(True, task, tools=tools, params=params,
                modality_required=required, modality_found=found,
                task_confidence=conf, rule=rule, reason=detail)


def _explain(required: str, found: str) -> str:
    names = {"single": "one image", "bi_temporal": "a bi-temporal pair",
             "optical_sar": "a co-registered optical and SAR pair", "none": "no images"}
    return (f"This question needs {names[required]}, but {names[found]} "
            f"{'was' if found in ('single', 'none') else 'were'} supplied.")


def _remedy(required: str) -> str:
    return {
        "bi_temporal": "Upload an image for T1 and an image for T2 — two dates of "
                       "the same area.",
        "optical_sar": "Upload a co-registered optical image and a SAR image of the "
                       "same area.",
        "single": "Upload at least one image.",
        "none": "Upload at least one image.",
    }[required]
