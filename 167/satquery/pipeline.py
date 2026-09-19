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
import secrets
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

from . import __version__, adapted, validate
from .evidence import Evidence, EvidenceSet
from .raster import Raster
from .router import Inputs, Plan, REGISTRY, plan as make_plan
from .runtime import ModelRuntime, load_runtime
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
        engine = "classical"
        for tool in p.tools:
            sub = self._execute(tool, query, inputs, p.params["threshold"])
            spec = self._spec_for(tool)
            # The classical measurement always runs. If a pack is loaded for
            # this tool's adapter the runtime is asked as well, and its claims
            # join as evidence — reconciled against the measurement, never in
            # place of it (CON-01, audit A3). `engine` reports what ran.
            path = "classical"
            if spec and spec.adapter_loaded:
                extra, outcome = adapted.consult(
                    self.runtime, REGISTRY[tool]["adapter"], tool, query,
                    self._rasters_for(tool, inputs), sub, self._reference(tool, inputs))
                if outcome["ran"]:
                    path = "neural+classical"
                    engine = "neural+classical"
                    for item in extra:
                        sub.add(item)
                    tr.add("Adapted model",
                           f"{outcome['pack']}{' (stub)' if outcome['stub'] else ''} · "
                           f"{outcome['claims']} claim(s)",
                           pack=outcome["pack"], stub=outcome["stub"])
                else:
                    tr.add("Adapted model",
                           f"{REGISTRY[tool]['adapter']} unavailable — {outcome['reason']}; "
                           "the classical measurement serves this tool", ok=False,
                           code=outcome["code"])
            for item in sub.items:
                es.add(item)
            tr.add(f"Executed {tool}",
                   f"{len(sub.items)} evidence item(s) · path {path}",
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
                elapsed_ms=round((time.time() - t0) * 1000, 1), engine=engine)

        tr.add("Confidence", f"{es.confidence:.2f} · "
                             f"{len(es.passing)}/{len(es.items)} items passed the gate")

        # 7 — phrase (evidence only — no pixels)
        text = answer(p.task, es, query)
        if "no rule matched" in p.rule:
            # The router did not recognise the question. Say so before the
            # description it fell back to, rather than answer as if it had.
            text = ("No specific question was recognised, so this is a general "
                    "description of the scene. " + text)
        gj = es.geojson()
        tr.add("Evidence returned",
               f"{len(gj['features'])} georeferenced feature(s) · {es.crs}",
               engine=engine, crs=es.crs)

        return Result(query=query, answer=text, confidence=es.confidence,
                      task=p.task, tools=p.tools, params=p.params,
                      evidence=es.to_dict(), geojson=gj, trace=tr.to_list(),
                      manifest=manifest,
                      elapsed_ms=round((time.time() - t0) * 1000, 1), engine=engine)

    # -- helpers ----------------------------------------------------------- #
    def _spec_for(self, tool: str):
        return self._tools().get(tool)

    def _rasters_for(self, tool: str, i: Inputs) -> dict[str, Raster]:
        """The inputs a tool reads, by role — what the runtime is shown."""
        if tool == "change_vqa":
            return {k: r for k, r in (("t1", i.t1), ("t2", i.t2)) if r is not None}
        if tool == "optical_sar":
            return {k: r for k, r in (("optical", i.optical), ("sar", i.sar)) if r is not None}
        o, s = self._single(i)
        return {k: r for k, r in (("optical", o), ("sar", s)) if r is not None}

    def _reference(self, tool: str, i: Inputs) -> Raster | None:
        """The raster whose pixel grid the runtime's boxes are in."""
        rs = list(self._rasters_for(tool, i).values())
        return (i.t2 if tool == "change_vqa" else None) or (rs[0] if rs else None)

    @staticmethod
    def _single(i: Inputs) -> tuple[Raster | None, Raster | None]:
        """Pick the optical and SAR rasters for a single-image task.

        The pair may have arrived in any role — a bi-temporal upload still
        contains a perfectly good single image, and T1 is the natural choice.
        """
        optical = i.optical or (i.t1 if i.t1 and i.t1.sensor != "sar" else None)             or (i.t2 if i.t2 and i.t2.sensor != "sar" else None)
        sar = i.sar or (i.t1 if i.t1 and i.t1.sensor == "sar" else None)             or (i.t2 if i.t2 and i.t2.sensor == "sar" else None)
        return optical, sar

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

    elif task == "grounding":
        g = items[0]
        if g.value:
            n = g.value
            parts.append(f"{n} region{'s' if n != 1 else ''} matched, covering "
                         f"{g.mask_area_ha:.2f} ha.")
            if g.boxes:
                b = g.boxes[0]
                c = b.centre()
                if c is not None:
                    parts.append(f"The largest is centred at {c[0]:.4f} N {c[1]:.4f} E "
                                 f"and covers {b.area_ha:.2f} ha.")
                else:
                    # not georeferenced: place it in the image, never on the ground
                    parts.append(f"The largest is centred at pixel ({(b.x0 + b.x1) / 2:.0f}, "
                                 f"{(b.y0 + b.y1) / 2:.0f}) and covers {b.area_px} px; "
                                 "the image has no coordinate system, so no ground area is stated.")
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
        if e.unit in ("regions", "areas"):
            parts.append(f"{e.value}.")
            if e.mask_area_ha:
                parts.append(f"Total extent {e.mask_area_ha:.2f} ha.")
        elif e.unit == "ha":
            parts.append(f"{e.value} hectares.")
        elif e.claim == "dominant land cover":
            parts.append(f"Dominant land cover is {e.value}.")
        else:
            parts.append(f"{e.value}." if e.value is not None else e.claim + ".")
        if e.supporting:
            parts.append("Shares: " + "; ".join(e.supporting[:3]) + ".")

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
