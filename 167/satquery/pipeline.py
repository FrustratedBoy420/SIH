"""Orchestration: query in, evidence-grounded answer out.

The order is fixed and each step is recorded:

    validate inputs -> classify task -> check compatibility -> select tools
    -> execute -> fuse evidence -> gate on confidence -> phrase the answer

Two properties this module exists to guarantee:

**The answer layer never sees pixels.** `answer()` is handed an `EvidenceSet`
and nothing else. It cannot invent a count because it was never given an image
to count from. That is ADR-007, enforced by the type signature rather than by
discipline.

**Everything observable is recorded; nothing internal is.** The trace carries
the selected task, the tools, the permitted parameters and the outputs, because
that is what the problem statement says is evaluated. It never carries model
reasoning, because the statement says that is neither required nor evaluated.
See ADR-008.
"""

from __future__ import annotations

import json
import platform
import re
import secrets
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

from . import __version__, validate
from .evidence import PIXEL_CRS, Evidence, EvidenceSet
from .raster import Raster
from .router import Inputs, Plan, REGISTRY, plan as make_plan
from .errors import SatQueryError
from .runtime import ModelRuntime, image_key, load_runtime, raster_rgb_u8
from .specialists import Change, Fusion, Grounding, VQA

# --------------------------------------------------------------------------- #
# trace
# --------------------------------------------------------------------------- #

@dataclass
class TraceStep:
    step: str
    detail: str
    ok: bool = True
    ms: float = 0.0
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class Trace:
    """The observable execution trace. Scored — see ADR-008."""

    steps: list[TraceStep] = field(default_factory=list)
    started: float = field(default_factory=time.time)

    def add(self, step: str, detail: str, ok: bool = True, **data) -> None:
        self.steps.append(TraceStep(step, detail, ok,
                                    round((time.time() - self.started) * 1000, 1),
                                    data))

    def to_list(self) -> list[dict]:
        return [asdict(s) for s in self.steps]

    @property
    def failed(self) -> bool:
        return any(not s.ok for s in self.steps)


# --------------------------------------------------------------------------- #
# result
# --------------------------------------------------------------------------- #

def new_run_id() -> str:
    """`run-<utc>-<hex>`: sortable by time, unique without a counter."""
    return (f"run-{time.strftime('%Y%m%dT%H%M%S', time.gmtime())}-"
            f"{secrets.token_hex(3)}")


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@dataclass
class Result:
    query: str
    answer: str
    refused: bool = False
    abstained: bool = False
    confidence: float = 0.0
    task: str = ""
    tools: list[str] = field(default_factory=list)
    params: dict[str, Any] = field(default_factory=dict)
    evidence: dict[str, Any] = field(default_factory=dict)
    geojson: dict[str, Any] = field(default_factory=dict)
    trace: list[dict] = field(default_factory=list)
    manifest: dict[str, Any] = field(default_factory=dict)
    elapsed_ms: float = 0.0
    version: str = __version__
    engine: str = "classical"
    #: Identity and provenance. `precomputed` is the venue fallback flag
    #: (ADP-09, TRC-04): true means these numbers came from a staged run, not
    #: from this request, and the UI says so.
    run_id: str = field(default_factory=new_run_id)
    created: str = field(default_factory=_now)
    precomputed: bool = False

    def to_dict(self) -> dict:
        return asdict(self)

    def dumps(self) -> str:
        return json.dumps(self.to_dict(), indent=2, default=str)


# --------------------------------------------------------------------------- #
# the pipeline
# --------------------------------------------------------------------------- #

class Pipeline:
    """Orchestration. Holds a `ModelRuntime`, never a model.

    Which component serves a capability is decided here and nowhere else: if
    the runtime has a pack for a tool's adapter the adapted path runs and the
    result reports `neural+classical`; otherwise the classical specialist runs
    and the result says `classical`. Both are recorded in the trace (TRC-05),
    so no one has to guess which one produced a number.
    """

    def __init__(self, threshold: float = 0.45,
                 runtime: ModelRuntime | None = None) -> None:
        self.threshold = threshold
        self.runtime = runtime if runtime is not None else load_runtime()
        self.grounding = Grounding()
        self.vqa = VQA()
        self.change = Change()
        self.fusion = Fusion()
        for tool, spec in self._tools().items():
            spec.adapter_loaded = self.runtime.available(REGISTRY[tool]["adapter"])

    def _tools(self) -> dict[str, Any]:
        return {"rs_vqa": self.vqa, "grounding": self.grounding,
                "change_vqa": self.change, "optical_sar": self.fusion}

    # -- main ------------------------------------------------------------- #
    def run(self, query: str, inputs: Inputs, threshold: float | None = None) -> Result:
        t0 = time.time()
        thr = self.threshold if threshold is None else threshold
        tr = Trace()

        # 1 — input validation (VAL-01). No model is touched anywhere above
        # the execute step, which is what makes a refusal cost milliseconds.
        manifest = validate.manifest(inputs)
        if manifest["count"] == 0:
            tr.add("Input validated", "no rasters supplied", ok=False)
            return self._refuse(query, "No imagery was supplied. Upload at least one "
                                       "image to analyse.", tr, manifest, t0)
        tr.add("Input validated",
               f"{manifest['count']} raster(s) · {manifest['modality']}",
               rasters=[{"role": r["role"], "sensor": r["sensor"],
                         "crs": r["crs"], "bands": r["bands"],
                         "gsd_m": r["gsd_m"], "georeferenced": r["georeferenced"]}
                        for r in manifest["rasters"]])

        # 2, 3, 4 — classify, check compatibility, select
        p: Plan = make_plan(query, inputs, thr)
        tr.add("Task identified", f"{p.task} · {p.rule}",
               confidence=p.task_confidence, router="rules")

        if not p.valid:
            tr.add("Compatibility check",
                   f"requires {p.modality_required or 'n/a'}, "
                   f"found {p.modality_found or 'n/a'}", ok=False)
            tr.add("Refused", "no model invoked", ok=False)
            return self._refuse(query, f"{p.reason} {p.remedy}", tr, manifest, t0,
                                task=p.task)

        tr.add("Compatibility check",
               f"{p.modality_found} satisfies {p.tools[0]}")
        tr.add("Tool selected",
               " -> ".join(f"{t} ({REGISTRY[t]['adapter']})" for t in p.tools),
               registry_size=len(REGISTRY))
        tr.add("Parameters",
               " · ".join(f"{k}={v}" for k, v in p.params.items()),
               permitted=sorted(REGISTRY[p.tools[0]]["params"]))

        # 4b — co-registration: validated, never solved (VAL-05, VAL-06).
        # Warping the imagery to make the answer possible would hide an
        # assumption the user never made, so the offset is measured, reported
        # and paid for in confidence instead.
        coreg = validate.coregistration(inputs)
        if coreg is not None:
            tr.add("Co-registration checked",
                   f"{coreg['pair']} · offset {coreg['offset_px']:.2f} px "
                   f"(tolerance {coreg['tolerance_px']:.0f} px)",
                   ok=bool(coreg["aligned"]),
                   offset_px=coreg["offset_px"], geometric_px=coreg["geometric_px"],
                   phase_px=coreg["phase_px"], same_crs=coreg["same_crs"],
                   same_shape=coreg["same_shape"])

        # 5 — execute
        es = EvidenceSet(threshold=p.params["threshold"])
        # Every georeferenced position is converted to WGS84, so EPSG:4326 is
        # right whenever there is a georeference at all. When there is none —
        # a benchmark PNG — boxes are pixel coordinates, and the collection must
        # say so: declared EPSG:4326, pixel (10, 40) is a place in Africa.
        present = [r for r in (inputs.optical, inputs.sar, inputs.t1, inputs.t2) if r is not None]
        if present and not any(r.georeferenced for r in present):
            es.crs = PIXEL_CRS
        engine = "classical"
        staged = False
        for tool in p.tools:
            sub = self._execute(tool, query, inputs, p.params["threshold"])
            ran, note = self._adapted(tool, query, inputs, sub)
            if (tool == "grounding" and not ran and _out_of_vocabulary(sub)
                    and _asks_in_words(query)):
                # "Where is the vehicle?" goes to grounding, whose vocabulary is
                # water, vegetation, built-up and bare soil — so every such
                # question about an object abstained, although M1 answers
                # position questions (VRSBench object position: 0.57). M1 answers
                # in words; no box is drawn, because none was measured.
                m1_ran, m1_note = self._adapted("rs_vqa", query, inputs, sub)
                if m1_ran:
                    ran, note = True, ("target not in the grounding vocabulary; "
                                       f"{m1_note}, answered in words — no box")
                elif m1_note:
                    note = m1_note
            for item in sub.items:
                es.add(item)
            spec = self._spec_for(tool)
            # `engine` records what RAN for this query, not what is installed.
            # A pack that is loaded but did not answer — a cache miss, SAR input,
            # no GPU — leaves the result classical, and the trace says why.
            path = "neural+classical" if ran else "classical"
            if ran:
                engine = "neural+classical"
            # An answer served from pre-computed M1 output came from a staged
            # run, not from this request — the flag the UI discloses (ADP-09).
            staged = staged or note.startswith("M1 precomputed")
            tr.add(f"Executed {tool}",
                   f"{len(sub.items)} evidence item(s) · path {path}"
                   + (f" · {note}" if note else ""),
                   items=[{"claim": i.claim, "value": i.value,
                           "confidence": round(i.confidence, 3),
                           "modality": i.modality} for i in sub.items])

        # 6 — fuse and gate
        pen = validate.penalty(coreg)
        if coreg is not None and not coreg["aligned"]:
            # Two effects, deliberately distinct: each record loses `pen` for
            # resting on imagery that does not line up, and the aggregate
            # loses its standard per-conflict penalty for the disagreement
            # being there at all (EvidenceSet.confidence).
            for e in es.items:
                e.confidence = round(max(0.0, e.confidence - pen), 3)
                e.conflicts.extend(coreg["conflicts"])
            tr.add("Co-registration penalty",
                   f"every record lowered by {pen:.2f}", ok=False,
                   penalty=pen, offset_px=coreg["offset_px"])

        conflicts = [c for e in es.items for c in e.conflicts]
        if conflicts:
            tr.add("Conflicts recorded",
                   f"{len(conflicts)} — confidence reduced", ok=True,
                   conflicts=conflicts)

        if es.abstain:
            tr.add("Confidence gate",
                   f"nothing cleared {es.threshold:.2f} — abstaining", ok=False)
            # When a record says *why* it could not measure (a missing band,
            # an unknown target), that reason is the useful answer — a generic
            # "not confident" would send the user to lower the threshold,
            # which cannot help.
            why = next((e.method for e in es.items if e.method.startswith("missing band")), "")
            text = ("I cannot answer that from this imagery: "
                    + why[len("missing band: "):] + ". Supply imagery with those "
                    "bands, or ask about something the supplied bands can measure."
                    if why else
                    "I am not sufficiently confident to answer that from this "
                    "imagery. Every measurement fell below the confidence "
                    "threshold, so no claim is being made.")
            return Result(
                query=query,
                answer=text,
                abstained=True, confidence=es.confidence, task=p.task,
                tools=p.tools, params=p.params, evidence=es.to_dict(),
                geojson=es.geojson(), trace=tr.to_list(), manifest=manifest,
                elapsed_ms=round((time.time() - t0) * 1000, 1), engine=engine,
                precomputed=staged)

        tr.add("Confidence", f"{es.confidence:.2f} · "
                             f"{len(es.passing)}/{len(es.items)} items passed the gate")

        # 7 — phrase (evidence only — no pixels)
        text = answer(p.task, es, query)
        gj = es.geojson()
        tr.add("Evidence returned",
               f"{len(gj['features'])} feature(s) · "
               + ("pixel space — the imagery is not georeferenced"
                  if es.crs == PIXEL_CRS else es.crs),
               engine=engine, crs=es.crs)

        return Result(query=query, answer=text, confidence=es.confidence,
                      task=p.task, tools=p.tools, params=p.params,
                      evidence=es.to_dict(), geojson=gj, trace=tr.to_list(),
                      manifest=manifest,
                      elapsed_ms=round((time.time() - t0) * 1000, 1), engine=engine,
                      precomputed=staged)

    # -- helpers ----------------------------------------------------------- #
    def _spec_for(self, tool: str):
        return self._tools().get(tool)

    @staticmethod
    def _single(i: Inputs) -> tuple[Raster | None, Raster | None]:
        """Pick the optical and SAR rasters for a single-image task.

        The pair may have arrived in any role — a bi-temporal upload still
        contains a perfectly good single image, and T1 is the natural choice.
        """
        optical = i.optical or (i.t1 if i.t1 and i.t1.sensor != "sar" else None)             or (i.t2 if i.t2 and i.t2.sensor != "sar" else None)
        sar = i.sar or (i.t1 if i.t1 and i.t1.sensor == "sar" else None)             or (i.t2 if i.t2 and i.t2.sensor == "sar" else None)
        return optical, sar

    def _adapted(self, tool: str, query: str, inputs: Inputs,
                 sub: EvidenceSet) -> tuple[bool, str]:
        """Ask the runtime for the adapted path; fold its answer into `sub`.

        Returns (ran, note). The adapted model is one more source of evidence,
        not a replacement for measurement (ADR-007): its answer becomes an
        `Evidence` record beside the classical ones, a disagreement with a
        measured value is recorded as a conflict and lowers confidence (audit
        A3), and the answer layer still phrases records, never pixels.
        """
        adapter = REGISTRY[tool]["adapter"]
        if not self.runtime.available(adapter):
            # A pack that is installed but cannot serve here is worth one line
            # in the trace: whoever reads this result should not have to open
            # /api/health to learn why the adapted model did not answer.
            if adapter in self.runtime.packs():
                why = getattr(self.runtime, "not_serving_reason", lambda a: "")(adapter)
                return False, f"M1 installed but not serving here: {why or 'no inference path'}"
            return False, ""

        payload: dict[str, Any] = {"question": query}
        task = tool
        if tool == "rs_vqa":
            if inputs.optical is None:
                # M1 was trained on optical imagery. Showing it SAR as a grey
                # photograph is the mistake 03 §7 names; the classical SAR path
                # answers instead.
                return False, "M1 not used: SAR input, and M1 is an optical model"
            rgb = raster_rgb_u8(inputs.optical)
            payload.update(image_key=image_key(rgb), _rgb_u8=rgb)
            task = "vqa"

        try:
            out = self.runtime.infer(adapter, task, payload)
        except SatQueryError as exc:
            return False, f"M1 not used: {exc.message}"

        if out.get("stub"):
            return True, "stub pack, no model output"
        answer_text = out.get("answer")
        if not answer_text:
            return False, "M1 not used: the runtime returned no answer"

        source = str(out.get("source", "live"))
        measured = next((e for e in sub.items if e.confidence > 0), None)
        ev = Evidence(
            claim="M1 answer", value=answer_text,
            confidence=float(out.get("confidence", 0.0)), modality="optical",
            source_model=str(out.get("pack", adapter)), source_version=source,
            method=f"M1 — QLoRA-adapted Qwen2-VL-7B ({source})",
            supporting=[f"served {source}"]
                       + ([f"measured: {measured.claim} = {measured.value}"] if measured else []))
        conflict, compared = _disagreement(answer_text, measured)
        if conflict:
            ev.conflicts.append(conflict)
        elif compared:
            # Only said when a comparison was actually made. "M1 agrees: Rural"
            # beside a hectare figure once implied a check that never happened.
            ev.supporting.append("agrees with measurement")

        if ev.confidence < sub.threshold:
            # Kept as evidence for transparency, but it will not pass the gate,
            # so it did not answer: the result must not claim the neural path.
            sub.items.append(ev)
            return False, (f"M1 answered {answer_text!r} at {ev.confidence:.2f}, "
                           f"below the {sub.threshold:.2f} gate — not used")

        # Order decides which record the answer layer leads with. A count or an
        # area is a measurement, and M1 counts poorly (object quantity 0.56 on
        # VRSBench) — the measured value leads and M1 corroborates. Everything
        # else — what is it, where, what shape, is there — M1 leads.
        #
        # Decided by what the classical path actually produced, not by
        # re-reading the question: "what type of area is this?" contains
        # "area" and is not a measurement, and guessing intent twice let the
        # two guesses disagree.
        # And when M1 and a measurement disagree, the measurement leads: it is
        # traceable to a method and a threshold, and the disagreement is shown.
        if conflict or (measured is not None and measured.unit in ("regions", "areas", "ha")):
            sub.items.append(ev)
        else:
            sub.items.insert(0, ev)
        return True, f"M1 {source}" + (" · conflict with measurement recorded" if conflict else "")

    def _execute(self, tool: str, query: str, i: Inputs, thr: float) -> EvidenceSet:
        if tool == "rs_vqa":
            o, s = self._single(i)
            return self.vqa.run(o, s, query, thr)
        if tool == "grounding":
            o, s = self._single(i)
            return self.grounding.run(o, s, query, thr)
        if tool == "change_vqa":
            assert i.t1 is not None and i.t2 is not None
            return self.change.run(i.t1, i.t2, query, thr)
        if tool == "optical_sar":
            assert i.optical is not None and i.sar is not None
            return self.fusion.run(i.optical, i.sar, query, thr)
        raise KeyError(f"{tool} is not in the registry")

    @staticmethod
    def _refuse(query: str, message: str, tr: Trace, manifest: dict,
                t0: float, task: str = "") -> Result:
        """A refusal is still a well-formed result.

        `evidence` and `geojson` carry their empty *shapes* rather than being
        left as bare dicts. A client reading `result.evidence.items` must get
        an empty list, not `undefined` — the response shape is part of the API
        contract and it should not depend on the outcome. Leaving them bare
        crashed the web client on every refusal, and the CLI never noticed
        because it checks `refused` before touching evidence.
        """
        empty = EvidenceSet(threshold=0.45)
        return Result(query=query, answer=message, refused=True, task=task,
                      evidence=empty.to_dict(), geojson=empty.geojson(),
                      trace=tr.to_list(), manifest=manifest,
                      elapsed_ms=round((time.time() - t0) * 1000, 1))


# --------------------------------------------------------------------------- #
# the answer layer — evidence in, sentence out. No pixels. ADR-007.
# --------------------------------------------------------------------------- #

_LABEL = {"built": "built-up", "water": "water", "vegetation": "vegetation",
          "bare": "bare-soil"}


def _plural(n: int, word: str, plural: str | None = None) -> str:
    """Agreement, because '1 structures' undermines everything around it."""
    return word if n == 1 else (plural or word + "s")


def _asks_in_words(query: str) -> bool:
    """A question ("where is the ship?") can be answered in words; an
    instruction ("highlight the ship") asks for a box, and a box nothing
    measured must not be offered in its place — the unicorn still abstains."""
    return bool(re.match(r"\s*(where|which|what)\b", (query or "").lower()))


def _out_of_vocabulary(es: EvidenceSet) -> bool:
    return any(e.claim == "target not in vocabulary" for e in es.items)


_NUMBER_WORDS = {"zero": 0, "no": 0, "none": 0, "one": 1, "two": 2, "three": 3,
                 "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
                 "nine": 9, "ten": 10, "eleven": 11, "twelve": 12}


def _disagreement(answer_text: str, measured: Evidence | None) -> tuple[str, bool]:
    """(conflict, compared). A conflict when M1 and a measurement answer the
    same thing differently — yes/no against presence, a number against a count.
    `compared` is False when the two answers are not comparable at all, so
    nothing may be said about agreement."""
    if measured is None:
        return "", False
    a = answer_text.strip().lower().rstrip(".")
    mv = measured.value
    if isinstance(mv, str) and mv in ("yes", "no") and a.split()[:1] in (["yes"], ["no"]):
        if a.split()[0] != mv:
            return f"M1 said {a.split()[0]!r}; measurement says {mv!r} ({measured.method})", True
        return "", True
    if measured.unit in ("regions", "areas") and isinstance(mv, (int, float)):
        first = a.split()[0] if a else ""
        n = int(first) if first.isdigit() else _NUMBER_WORDS.get(first)
        if n is not None:
            if n != int(mv):
                return f"M1 counted {n}; measurement counts {int(mv)} ({measured.method})", True
            return "", True
    return "", False


def answer(task: str, es: EvidenceSet, query: str = "") -> str:
    """Phrase verified evidence.

    Deliberately template-driven. A language model may be substituted here and
    the contract is unchanged: it receives `EvidenceSet` and never an image, so
    every number in the output traces to something that was measured and passed
    the confidence gate.
    """
    items = es.passing
    if not items:
        return "No claim cleared the confidence threshold."

    by_claim = {e.claim: e for e in items}
    parts: list[str] = []
    m1_phrased = False

    if task == "cross_modal":
        rec = next((e for e in items if "recovered by SAR" in e.claim), None)
        cloud = next((e for e in items if "obscured by cloud" in e.claim), None)
        sar = next((e for e in items if "backscatter" in e.claim), None)
        if sar:
            n_sar = int(sar.value or 0)
            parts.append(f"SAR detects {n_sar} built-up "
                         f"{_plural(n_sar, 'area')} totalling "
                         f"{sar.mask_area_ha:.1f} ha.")
        if cloud:
            parts.append(f"Cloud obscures {cloud.value}% of the optical scene.")
        if rec and rec.value:
            n_rec = int(rec.value)
            parts.append(
                f"{n_rec} of {_plural(n_rec, 'them', 'them')} — {rec.mask_area_ha:.1f} ha — "
                "lies beneath that cloud and is invisible to the optical sensor. "
                "Radar recovered it because radar penetrates cloud and built "
                "structures return strongly from corner reflection. That is "
                "information neither sensor provides alone."
                if n_rec == 1 else
                f"{n_rec} of them — {rec.mask_area_ha:.1f} ha — lie beneath that "
                "cloud and are invisible to the optical sensor. Radar recovered "
                "them because radar penetrates cloud and built structures return "
                "strongly from corner reflection. That is information neither "
                "sensor provides alone.")
        elif rec:
            parts.append("No detected built-up area lies beneath cloud in this "
                         "scene, so here the two sensors corroborate each other "
                         "rather than complement each other.")

    elif task == "temporal_change":
        ch = next((e for e in items if "change" in e.claim), None)
        trend = by_claim.get("built-up area trend")
        if ch and ch.value:
            n_ch = int(ch.value)
            parts.append(f"{n_ch} changed {_plural(n_ch, 'region')} "
                         f"{'was' if n_ch == 1 else 'were'} detected between the two "
                         f"dates, covering {ch.mask_area_ha:.2f} ha.")
            sem = next((s for s in ch.supporting if "NDVI delta" in s), "")
            if sem:
                parts.append(sem[0].upper() + sem[1:] + ".")
        elif ch:
            parts.append("No significant change was detected between the two dates.")
        if trend is not None and isinstance(trend.value, (int, float)):
            d = float(trend.value)
            parts.append(f"Built-up share {'rose' if d > 0 else 'fell'} by "
                         f"{abs(d):.2f} percentage points.")

    elif task == "grounding" and items[0].claim == "M1 answer":
        parts.append(f"{str(items[0].value).rstrip('.')}.")
        m1_phrased = True

    elif task == "grounding":
        g = items[0]
        if g.value:
            n = g.value
            parts.append(f"{n} region{'s' if n != 1 else ''} matched, covering "
                         f"{g.mask_area_ha:.2f} ha.")
            if g.boxes:
                lat, lon = g.boxes[0].centre()
                parts.append(f"The largest is centred at {abs(lat):.4f} {'N' if lat >= 0 else 'S'} {abs(lon):.4f} {'E' if lon >= 0 else 'W'} "
                             f"and covers {g.boxes[0].area_ha:.2f} ha.")
        else:
            parts.append("Nothing matching that description was located in this scene.")

    elif any(e.claim.startswith("detected ") for e in items):
        # Structured scene summary (audit B3): shares, then detected classes.
        dom = by_claim.get("dominant land cover")
        if dom is not None:
            parts.append(f"Dominant land cover is {dom.value}.")
            if dom.supporting:
                parts.append("Shares: " + "; ".join(dom.supporting[:4]) + ".")
        found = [e for e in items if e.claim.startswith("detected ") and e.value]
        if found:
            parts.append("Detected: " + "; ".join(
                f"{int(e.value)} {_LABEL.get(e.claim.removeprefix('detected ').removesuffix(' regions'), '')} "
                f"{_plural(int(e.value), 'region')} ({e.mask_area_ha:.1f} ha)"
                for e in found) + ".")

    else:  # single_vqa
        e = items[0]
        if e.claim == "M1 answer":
            # The adapted model's answer, as given. Its provenance lives in the
            # evidence record and the trace, not in the sentence.
            parts.append(f"{str(e.value).rstrip('.')}.")
            m1_phrased = True
        elif e.unit in ("regions", "areas"):
            parts.append(f"{e.value}.")
            if e.mask_area_ha:
                parts.append(f"Total extent {e.mask_area_ha:.2f} ha.")
        elif e.unit == "ha":
            v = e.value
            parts.append(f"{v:,.2f} hectares." if isinstance(v, (int, float)) else f"{v} hectares.")
        elif e.claim == "dominant land cover":
            parts.append(f"Dominant land cover is {e.value}.")
        else:
            v = e.value
            parts.append(f"{str(v)[:1].upper()}{str(v)[1:]}." if v is not None else e.claim + ".")
        # "Shares" are land-cover shares. Under any other record the same
        # label once put threshold diagnostics in front of the user.
        if e.supporting and e.claim == "dominant land cover":
            parts.append("Shares: " + "; ".join(e.supporting[:3]) + ".")

    # M1 answered but a measurement led (a count, an area) or the answer is a
    # structured summary: the adapted model's reading must still be visible.
    # A result that reports `engine: neural+classical` while never saying what
    # the neural model said would be a claim with nothing behind it on screen.
    m1 = by_claim.get("M1 answer")
    if m1 is not None and not m1_phrased and not m1.conflicts:
        said = str(m1.value).rstrip('.')
        if any(e.claim.startswith("detected ") for e in items):
            parts.insert(0, f"The adapted model (M1) reads the scene as: {said}.")
        elif "agrees with measurement" in m1.supporting:
            parts.append(f"The adapted model (M1) agrees: {said}.")
        else:
            parts.append(f"The adapted model (M1) answers: {said}.")

    conflicts = [c for e in items for c in e.conflicts]
    if conflicts:
        parts.append("Note: " + conflicts[0])

    return " ".join(parts) if parts else "Analysis complete; see the evidence panel."


# --------------------------------------------------------------------------- #
# run persistence
# --------------------------------------------------------------------------- #

def save_run(result: Result, root: str | Path = "runs") -> Path:
    """Write a run to disk so any stage can be replayed without recomputing."""
    root = Path(root)
    run_id = time.strftime("%Y%m%dT%H%M%S")
    d = root / run_id
    d.mkdir(parents=True, exist_ok=True)
    (d / "run.json").write_text(result.dumps(), encoding="utf-8")
    (d / "evidence.geojson").write_text(
        json.dumps(result.geojson, indent=2), encoding="utf-8")
    (d / "environment.json").write_text(json.dumps({
        "version": __version__, "python": platform.python_version(),
        "platform": platform.platform(), "engine": result.engine,
    }, indent=2), encoding="utf-8")
    return d
