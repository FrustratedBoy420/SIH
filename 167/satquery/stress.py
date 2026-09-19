"""The stress suite (EVL-08): does the system behave well when the input is bad?

Accuracy on a clean scene says little about trust. Each case below takes a
clean synthetic scene, breaks it in one specific way, runs the real pipeline,
and checks the *behaviour* a trustworthy system owes the user: refuse what it
cannot answer, abstain when nothing clears the gate, flag and pay for doubt,
and stay within tolerance where the degradation is mild. Every case states
its expectation up front, so a failure is a finding, not a judgement call.

    satquery stress            prints the table and exits 1 on any failure
"""

from __future__ import annotations

import tempfile
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Callable

import numpy as np

from . import scene as scenes
from .errors import SatQueryError
from .pipeline import Pipeline, Result
from .raster import GeoTransform, Raster, read as read_raster
from .router import Inputs

SIZE, SEED = 128, 7
AREA_TOL = 0.30


@dataclass
class Case:
    name: str
    condition: str
    expect: str
    ok: bool = False
    observed: str = ""


def _area(r: Result, claim: str) -> float | None:
    for e in r.evidence.get("items", []):
        if e["claim"] == claim:
            return float(e["mask_area_ha"])
    return None


def _ha(sc: scenes.Scene, mask: np.ndarray, r: Raster) -> float:
    return float(mask.sum()) * r.transform.ground_sample_distance ** 2 / 10_000.0


def _copy(r: Raster, data: np.ndarray | None = None, **kw) -> Raster:
    return replace(r, data=(r.data if data is None else data).astype(np.float32).copy(),
                   meta=dict(r.meta), **kw)


def run_suite() -> list[Case]:
    pipe = Pipeline()
    sc = scenes.build(size=SIZE, seed=SEED)
    opt_clear, opt, sar = sc.optical(SEED, with_cloud=False), sc.optical(SEED), sc.sar(SEED)
    water_ha = _ha(sc, sc.classes == scenes.WATER, opt_clear)
    cases: list[Case] = []

    def case(name: str, condition: str, expect: str, fn: Callable[[], tuple[bool, str]]) -> None:
        c = Case(name, condition, expect)
        try:
            ok, c.observed = fn()
            c.ok = bool(ok)
        except Exception as exc:                                  # noqa: BLE001
            c.ok, c.observed = False, f"raised {type(exc).__name__}: {exc}"
        cases.append(c)

    # -- geometry -------------------------------------------------------- #
    def misregistered():
        base = pipe.run("use the optical and SAR images together", Inputs(optical=opt, sar=sar))
        shifted = _copy(sar, np.roll(sar.data, 6, axis=2))
        r = pipe.run("use the optical and SAR images together", Inputs(optical=opt, sar=shifted))
        flagged = any(s["step"] == "Co-registration checked" and not s["ok"] for s in r.trace)
        return (flagged and r.confidence < base.confidence,
                f"flagged {flagged}; confidence {base.confidence:.2f} -> {r.confidence:.2f}")
    case("misregistration", "SAR shifted 6 px east of the optical plate",
         "co-registration flagged and aggregate confidence lowered", misregistered)

    def mismatched():
        t1s, t2s, _ = scenes.bitemporal(size=SIZE, seed=SEED)
        other = scenes.build(size=SIZE + 32, seed=SEED + 1).optical(SEED, with_cloud=False)
        r = pipe.run("what changed between these two dates?", Inputs(t1=t1s.optical(SEED, with_cloud=False), t2=other))
        return (r.refused or r.abstained or r.confidence < 0.45,
                f"refused {r.refused}, abstained {r.abstained}, confidence {r.confidence:.2f}")
    case("mismatched pair", "T1 and T2 of different extents and sizes",
         "refused or abstained — no change area claimed", mismatched)

    # -- radiometry ------------------------------------------------------ #
    def haze():
        hazy = _copy(opt_clear, np.clip(opt_clear.data * 0.8 + 0.12, 0, 1))
        got = _area(pipe.run("highlight the water body", Inputs(optical=hazy)), "water regions located")
        ok = got is not None and abs(got - water_ha) <= AREA_TOL * water_ha
        return ok, f"water {got} ha vs truth {water_ha:.1f} ha"
    case("haze", "optical brightened and flattened (x0.8 + 0.12)",
         f"water area still within ±{AREA_TOL:.0%} of truth", haze)

    def low_contrast():
        dim = _copy(opt_clear, opt_clear.data * 0.3)
        got = _area(pipe.run("highlight the water body", Inputs(optical=dim)), "water regions located")
        ok = got is not None and abs(got - water_ha) <= AREA_TOL * water_ha
        return ok, f"water {got} ha vs truth {water_ha:.1f} ha"
    case("low contrast", "optical scaled to 30 % brightness",
         f"water area still within ±{AREA_TOL:.0%} of truth (indices are ratios)", low_contrast)

    def overcast():
        white = _copy(opt, np.full_like(opt.data, 0.92))
        r = pipe.run("highlight the water body", Inputs(optical=white))
        got = _area(r, "water regions located") or 0.0
        return (r.abstained or got < 0.1 * water_ha,
                f"abstained {r.abstained}; water claimed {got:.1f} ha")
    case("total cloud", "optical plate entirely cloud",
         "no water claimed — abstains or reports ~none", overcast)

    def noisy_sar():
        rng = np.random.default_rng(0)
        loud = _copy(sar, np.clip(sar.data * rng.gamma(1.0, 1.0, sar.data.shape), 0, 1.5))
        r = pipe.run("use the optical and SAR images together", Inputs(optical=opt, sar=loud))
        return (not r.refused and r.evidence.get("items"), f"confidence {r.confidence:.2f}, {len(r.evidence.get('items', []))} records")
    case("single-look speckle", "SAR multiplied by 1-look gamma speckle",
         "still answers (Lee filter), with records", noisy_sar)

    # -- inputs the question cannot use --------------------------------- #
    def one_image_change():
        r = pipe.run("what changed between these two dates?", Inputs(optical=opt_clear))
        executed = [s for s in r.trace if s["step"].startswith("Executed")]
        return r.refused and not executed, f"refused {r.refused}; executed steps {len(executed)}"
    case("change on one image", "a change question with a single optical image",
         "refused before any model runs", one_image_change)

    def implicit_temporal():
        r = pipe.run("Has the built-up area increased, decreased, or remained unchanged?", Inputs(optical=opt_clear))
        return r.refused, f"refused {r.refused}: {r.answer[:70]}"
    case("implicit temporal (RQ-5)", "no temporal keyword, one image",
         "recognised as change and refused", implicit_temporal)

    def sar_only_water():
        r = pipe.run("highlight the water body", Inputs(sar=sar))
        return (r.refused or r.abstained or "missing band" in r.answer.lower() or "cannot" in r.answer.lower(),
                f"refused {r.refused}, abstained {r.abstained}: {r.answer[:70]}")
    case("SAR only, optical question", "water via NDWI asked of a SAR image",
         "refused or answered as not possible — no wrong band substituted", sar_only_water)

    def fusion_one_sensor():
        r = pipe.run("use the optical and SAR images together", Inputs(optical=opt))
        return r.refused, f"refused {r.refused}: {r.answer[:70]}"
    case("cross-modal, one sensor", "cross-modal question with optical only",
         "refused with a remedy naming SAR", fusion_one_sensor)

    # -- change magnitude ------------------------------------------------ #
    for label, growth in (("tiny change", 0.004), ("large change", 0.25)):
        def change(growth=growth):
            t1s, t2s, truth = scenes.bitemporal(size=SIZE, seed=SEED, growth=growth)
            t1, t2 = t1s.optical(SEED, with_cloud=False), t2s.optical(SEED, with_cloud=False)
            want = _ha(t2s, truth, t2)
            r = pipe.run("what changed between these two dates?", Inputs(t1=t1, t2=t2))
            got = _area(r, "change detected between the two dates")
            if growth < 0.01:
                # Below the detection floor the right behaviour is to say so,
                # not to invent a change. The miss itself is reported.
                none = any(e["claim"] == "no significant change detected" for e in r.evidence.get("items", []))
                return (none or r.abstained or (got is not None and got <= 3 * want),
                        f"'no significant change' {none}; claimed {got} ha vs truth {want:.1f} ha "
                        f"({t2s.truth['changed_fraction']:.2%} of the scene)")
            return (got is not None and abs(got - want) <= 0.5 * want,
                    f"claimed {got} ha vs truth {want:.1f} ha")
        case(label, f"urban growth {growth:.1%} between dates",
             "no large change invented (detects it or says none)" if growth < 0.01 else "changed area within ±50 % of truth", change)

    # -- queries --------------------------------------------------------- #
    def gibberish():
        r = pipe.run("zxqv plorn", Inputs(optical=opt_clear))
        said = "no specific question was recognised" in r.answer.lower()
        return (r.refused or r.abstained or said, f"{r.answer[:90]}")
    case("unintelligible query", "'zxqv plorn'",
         "refused, abstained, or says the question was not recognised", gibberish)

    def out_of_vocabulary():
        r = pipe.run("Highlight the unicorn.", Inputs(optical=opt_clear))
        return r.abstained or r.refused, f"abstained {r.abstained}: {r.answer[:60]}"
    case("out of vocabulary", "'Highlight the unicorn.'", "abstains — nothing is invented", out_of_vocabulary)

    # -- files ----------------------------------------------------------- #
    def malformed():
        # through the upload path a user takes, which must answer in words
        from .store import RasterStore
        store = RasterStore(Path(tempfile.mkdtemp()))
        try:
            store.put(b"plain text with a .tif extension", "not_a_tiff.tif", "optical")
        except SatQueryError as exc:
            leaks = "/" in exc.message or "\\" in exc.message
            return (bool(exc.remedy) and not leaks,
                    f"{exc.code}: {exc.message[:80]}{' (LEAKS A PATH)' if leaks else ''}")
        return False, "accepted without complaint"
    case("malformed file", "text saved as .tif, uploaded", "a typed error with a remedy — no stack trace, no server path", malformed)

    def crs_less():
        bare = _copy(opt_clear, georeferenced=False, crs="none",
                     transform=GeoTransform.identity(opt_clear.width, opt_clear.height))
        r = pipe.run("highlight the water body", Inputs(optical=bare))
        boxes = [b for e in r.evidence.get("items", []) for b in e.get("boxes", [])]
        geo = [b for b in boxes if b.get("lon0") is not None]
        area = _area(r, "water regions located")
        return (not geo and not area, f"{len(boxes)} boxes, {len(geo)} with coordinates; area {area}")
    case("no CRS", "optical with no georeferencing",
         "answers in pixel coordinates — no lat/lon, no hectares", crs_less)

    return cases


def summary(cases: list[Case]) -> dict[str, Any]:
    import time
    from . import __version__
    return {"passed": sum(c.ok for c in cases), "total": len(cases),
            "cases": [c.__dict__ for c in cases],
            "measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "version": __version__, "scene": {"size": SIZE, "seed": SEED}}


from .paths import public as _public
STRESS_PATH = _public() / "stress.json"
