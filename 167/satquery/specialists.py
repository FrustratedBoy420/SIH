"""The four specialist analysers.

One per mandatory capability in the problem statement:

    grounding   §5.2  text-guided region grounding      -> M2
    vqa         §5.2  visual question answering         -> M1
    change      §5.3  bi-temporal change analysis       -> M3
    fusion      §5.4  optical-SAR complementary extract -> M4

**On the relationship to the vision-language models.** Each class here has a
`model` attribute naming the adapter that *should* serve it, and an
`adapter_loaded` flag. When trained LoRA weights are present the neural path
runs and these measurements become its grounding — the model proposes, this
verifies, and the numbers in the answer still come from pixels. When weights
are absent — which is the state today, and on any machine without a GPU — the
classical path runs alone and says so in the trace.

That is not a mock. The measurements are real either way; what changes is
whether a learned model is also consulted. Every number reported by this module
was computed from the raster it was given.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import numpy as np

from . import cv
from .validate import TOLERANCE_PX
from .evidence import (Evidence, EvidenceSet, GeoBox, boxes_from_props,
                       confidence_from_separation, mask_area_ha)
from .raster import Raster, coregistration_offset

# --------------------------------------------------------------------------- #
# target vocabulary — what a text query can refer to
# --------------------------------------------------------------------------- #

# `mode` is the important field, and it is physical rather than arbitrary.
#
# A remote-sensing scene contains four scattering/reflectance regimes, so every
# index over it is multi-modal — NDWI runs water +0.70, built -0.05, soil -0.18,
# vegetation -0.65. A two-class Otsu answers "where is the best split into two
# groups?", which lands between the middle modes and returns half the scene.
#
#   top     the target is the extreme HIGH mode  -> upper threshold of a 3-class split
#   bottom  the target is the extreme LOW mode   -> lower threshold of a 3-class split
#   band    the target sits BETWEEN two others   -> between both thresholds
#
# Bare soil is the instructive case: its NDVI sits above water and below
# vegetation, so no single threshold isolates it and "low NDVI" would return
# the rivers as well.
TARGETS: dict[str, dict[str, Any]] = {
    "water": {
        "words": ("water", "river", "lake", "channel", "waterbody",
                  "water body", "stream", "reservoir", "pond"),
        "index": "ndwi", "mode": "top", "min_area": 60, "linear": True,
        # McFeeters (1996): NDWI > 0 is the standard open-water criterion.
        "floor": 0.0,
    },
    "vegetation": {
        "words": ("vegetation", "forest", "green", "crop", "tree", "canopy",
                  "farmland", "agricultur"),
        "index": "ndvi", "mode": "top", "min_area": 120,
        # NDVI above ~0.2 is the conventional floor for meaningful vegetation.
        "floor": 0.20,
    },
    "built": {
        "words": ("building", "built", "built-up", "urban", "settlement",
                  "structure", "house", "city", "town", "infrastructure"),
        "index": "backscatter", "mode": "top", "min_area": 40,
    },
    "bare": {
        "words": ("bare", "soil", "barren", "sand", "exposed", "fallow"),
        "index": "ndvi", "mode": "band", "min_area": 100,
    },
}


def resolve_target(text: str) -> str | None:
    """Map free text onto a target class. Returns None when nothing matches.

    Returning None matters: a grounding request for something outside the
    vocabulary must fail loudly rather than silently grounding the wrong thing.
    """
    low = (text or "").lower()
    best, score = None, 0
    for name, spec in TARGETS.items():
        for w in spec["words"]:
            if w in low and len(w) > score:
                best, score = name, len(w)
    return best


# --------------------------------------------------------------------------- #
# base
# --------------------------------------------------------------------------- #

@dataclass
class Specialist:
    name: str = "specialist"
    model: str = ""
    version: str = "0.1.0"
    adapter_loaded: bool = False

    @property
    def path(self) -> str:
        return "neural+classical" if self.adapter_loaded else "classical"

    def _ev(self, **kw) -> Evidence:
        return Evidence(source_model=self.model or self.name,
                        source_version=self.version, **kw)


# --------------------------------------------------------------------------- #
# M2 — grounding
# --------------------------------------------------------------------------- #

class Grounding(Specialist):
    """Text-guided region grounding.

    Chosen over captioning per ADR-002: a box is verifiable in a second, and it
    carries coordinates the rest of the system can use.
    """

    def __init__(self) -> None:
        super().__init__(name="grounding", model="adapter_B_grounding")

    def run(self, optical: Raster | None, sar: Raster | None, query: str,
            threshold: float = 0.45) -> EvidenceSet:
        es = EvidenceSet(threshold=threshold)
        target = resolve_target(query)
        if target is None:
            es.add(self._ev(
                claim="target not in vocabulary", confidence=0.0,
                method="resolve_target returned no match",
                supporting=[f"vocabulary: {', '.join(TARGETS)}"]))
            return es

        spec = TARGETS[target]
        score, modality, method = self._score(target, spec, optical, sar)
        if score is None:
            es.add(self._ev(claim=f"cannot ground {target} from the supplied bands",
                            confidence=0.0, method=method,
                            conflicts=[method[0].upper() + method[1:] + "."]))
            return es

        mask, thr, split = self._threshold(score, spec["mode"], spec.get("floor"))
        # Opening erodes then dilates, which deletes any structure narrower than
        # the kernel. A river three pixels wide does not survive it — measured
        # water IoU was 0.28 with opening and 0.86 without. Linear features get
        # closing only, which still fills gaps without thinning them.
        if not spec.get("linear"):
            mask = cv.opening(mask, 1)
        mask = cv.closing(mask, 1)

        ref = optical or sar
        assert ref is not None
        labels, n = cv.connected_components(mask)
        # a fixed pixel floor means something different at every resolution;
        # scale it so "too small to be real" stays the same ground area
        scale = (ref.width * ref.height) / (512.0 * 512.0)
        min_area = max(12, int(spec["min_area"] * scale))
        props = cv.region_props(labels, n, min_area=min_area)

        conf = confidence_from_separation(score, thr)
        ev_conflicts: list[str] = []
        # Bare soil and built-up are nearly indistinguishable in NDVI — both sit
        # in the same low-vegetation band. This is a real limitation of optical
        # imagery, not of this implementation, and it is exactly the ambiguity
        # SAR resolves: structures backscatter strongly, bare ground does not.
        if target == "bare":
            ev_conflicts.append(
                "bare soil and built-up share an NDVI range, so this extent "
                "includes built-up ground; SAR backscatter separates them")
            conf = min(conf, 0.72)

        es.add(self._ev(
            conflicts=ev_conflicts,
            claim=f"{target} regions located",
            value=len(props), unit="regions",
            confidence=conf if props else 0.15,
            modality=modality,
            boxes=boxes_from_props(props, ref.transform, georeferenced=ref.georeferenced),
            mask_area_ha=mask_area_ha(mask, ref.transform, ref.georeferenced),
            method=method,
            supporting=[split,
                        f"{len(props)} regions above {min_area} px",
                        f"path: {self.path}"]))
        return es

    @staticmethod
    def _threshold(score: np.ndarray, mode: str, floor: float | None = None
                   ) -> tuple[np.ndarray, float, str]:
        """Isolate the requested mode of a multi-modal index. See TARGETS.

        Otsu is data-driven, which is what makes it adapt to a scene it was not
        tuned on — but with four land-cover classes it can put a threshold
        exactly on top of a class you did not want. Measured here: the upper
        threshold of a 3-class split on NDWI landed at -0.053, which is the
        built-up value, so built-up was returned as water and precision fell to
        0.29 at perfect recall.

        Where the index has a *physically meaningful* floor, the Otsu result is
        clamped to it. This keeps the threshold adaptive while making a
        physically absurd answer impossible:

            NDWI > 0      McFeeters (1996), open water
            NDVI > 0.2    conventional floor for meaningful vegetation

        Backscatter has no universal cut — a dB threshold depends on the sensor,
        the incidence angle and the calibration — so it stays purely Otsu.
        """
        lo, hi = cv.otsu_multi(score, classes=3)
        if mode == "top":
            thr, note = hi, f"upper threshold {hi:.4f} of a 3-class Otsu split"
            if floor is not None and thr < floor:
                thr = floor
                note = (f"Otsu gave {hi:.4f}, clamped to the physical floor "
                        f"{floor:.2f}")
            return score >= thr, thr, note
        if mode == "bottom":
            return score <= lo, lo, f"lower threshold {lo:.4f} of a 3-class Otsu split"
        return ((score > lo) & (score < hi)), (lo + hi) / 2,                f"between {lo:.4f} and {hi:.4f}, the middle class of a 3-class split"

    def _score(self, target: str, spec: dict, optical: Raster | None,
               sar: Raster | None) -> tuple[np.ndarray | None, str, str]:
        idx = spec["index"]
        if idx == "ndwi" and optical and optical.has("green") and optical.has("nir"):
            return cv.ndwi(optical.named("green"), optical.named("nir")), "optical", \
                   "NDWI = (green - nir) / (green + nir)"
        if idx == "ndvi" and optical and optical.has("nir") and optical.has("red"):
            return cv.ndvi(optical.named("nir"), optical.named("red")), "optical", \
                   "NDVI = (nir - red) / (nir + red)"
        if idx == "backscatter" and sar is not None:
            vv = cv.lee_filter(sar.named("vv"), size=7, looks=4)
            return vv, "sar", "Lee-filtered VV backscatter, 7x7, 4 looks"
        # Brightness is a defensible proxy for built-up surfaces only: roofs
        # and pavement are bright in every visible band. For water it is the
        # opposite of right — water is dark — and substituting it returned
        # bright roofs labelled as a river. Every other target without its
        # bands is refused by name (ING-04: a missing band is a loud error,
        # never a wrong band).
        if idx == "backscatter" and optical is not None:
            g = optical.rgb().mean(axis=2)
            return g, "optical", "visible brightness as a built-up proxy (no SAR supplied)"
        need = {"ndwi": ("green", "nir"), "ndvi": ("red", "nir"),
                "backscatter": ("vv",)}.get(idx, ())
        have = sorted({b for r in (optical, sar) if r is not None for b in r.band_names})
        missing = [b for b in need if b not in have]
        return None, "derived", (f"missing band: {target} needs {' and '.join(need)}; "
                                 f"{', '.join(missing) or 'none'} absent from the "
                                 f"supplied bands ({', '.join(have) or 'none'})")


# --------------------------------------------------------------------------- #
# M1 — visual question answering
# --------------------------------------------------------------------------- #

class VQA(Specialist):
    """Visual question answering.

    Questions are resolved to a *measurable property* and then measured. The
    count in the answer is produced by connected-component labelling, not by a
    language model — which is precisely the separation ADR-007 requires.
    """

    def __init__(self) -> None:
        super().__init__(name="rs_vqa", model="adapter_A_rs_general")

    def run(self, optical: Raster | None, sar: Raster | None, question: str,
            threshold: float = 0.45) -> EvidenceSet:
        es = EvidenceSet(threshold=threshold)
        q = (question or "").lower()
        ref = optical or sar
        if ref is None:
            es.add(self._ev(claim="no raster supplied", confidence=0.0))
            return es

        kind = self._intent(q)
        target = resolve_target(q)

        if kind == "count":
            if target is None:
                es.add(self._ev(claim="nothing countable named in the question",
                                confidence=0.0,
                                supporting=[f"vocabulary: {', '.join(TARGETS)}"]))
                return es
            sub = Grounding().run(optical, sar, target, threshold)
            src = sub.items[0]
            es.add(self._ev(
                claim=f"count of {target} regions",
                value=src.value, unit="regions", confidence=src.confidence,
                modality=src.modality, boxes=src.boxes,
                mask_area_ha=src.mask_area_ha,
                method="connected-component labelling over the thresholded index",
                supporting=src.supporting))
            return es

        if kind == "presence":
            if target is None:
                es.add(self._ev(claim="nothing identifiable named", confidence=0.0))
                return es
            sub = Grounding().run(optical, sar, target, threshold)
            src = sub.items[0]
            present = bool(src.value)
            es.add(self._ev(
                claim=f"presence of {target}", value="yes" if present else "no",
                confidence=src.confidence, modality=src.modality,
                boxes=src.boxes[:6], mask_area_ha=src.mask_area_ha,
                method="thresholded index, then area test",
                supporting=src.supporting))
            return es

        if kind == "area" and target is not None:
            sub = Grounding().run(optical, sar, target, threshold)
            src = sub.items[0]
            es.add(self._ev(
                claim=f"area of {target}", value=src.mask_area_ha, unit="ha",
                confidence=src.confidence, modality=src.modality,
                mask_area_ha=src.mask_area_ha,
                method="pixel count x ground sample distance squared",
                supporting=src.supporting))
            return es

        if kind == "describe":
            return self._describe(optical, sar, threshold, es)

        # dominant land cover — the general fallback
        return self._dominant(optical, sar, es)

    def _describe(self, optical: Raster | None, sar: Raster | None,
                  threshold: float, es: EvidenceSet) -> EvidenceSet:
        """A structured scene summary, built from evidence — audit B3.

        "Describe this scene" is the query a captioning model answers most
        fluently and least verifiably. Here it is answered as a list of
        measurements: the land-cover shares, then one record per class that
        could actually be detected in the bands supplied. The answer layer
        phrases those records; it has nothing else to phrase.
        """
        self._dominant(optical, sar, es)
        for target in ("built", "water", "vegetation"):
            spec = TARGETS[target]
            if spec["index"] == "backscatter" and sar is None and optical is None:
                continue
            if spec["index"] in ("ndwi", "ndvi") and (optical is None or not optical.has("nir")):
                continue
            sub = Grounding().run(optical, sar, target, threshold)
            if not sub.items:
                continue
            src = sub.items[0]
            es.add(self._ev(
                claim=f"detected {target} regions", value=src.value,
                unit="regions", confidence=src.confidence,
                modality=src.modality, boxes=src.boxes[:8],
                mask_area_ha=src.mask_area_ha,
                method="per-class grounding, summarised",
                supporting=src.supporting))
        return es

    def _dominant(self, optical: Raster | None, sar: Raster | None,
                  es: EvidenceSet) -> EvidenceSet:
        ref = optical or sar
        assert ref is not None
        shares: dict[str, float] = {}
        if optical is not None and optical.has("nir") and optical.has("red"):
            veg = cv.ndvi(optical.named("nir"), optical.named("red"))
            wat = cv.ndwi(optical.named("green"), optical.named("nir")) \
                if optical.has("green") else np.full_like(veg, -1)
            shares["vegetation"] = float((veg > 0.28).mean())
            shares["water"] = float((wat > 0.05).mean())
            shares["bare soil"] = float((veg <= 0.28).mean() - shares["water"])
        if sar is not None:
            vv = cv.lee_filter(sar.named("vv"))
            shares["built-up"] = float((vv > cv.otsu(vv)).mean())

        shares = {k: max(0.0, v) for k, v in shares.items()}
        if not shares:
            es.add(self._ev(claim="insufficient bands to classify", confidence=0.0))
            return es
        top = max(shares, key=shares.get)
        es.add(self._ev(
            claim="dominant land cover", value=top, unit="",
            confidence=round(0.45 + 0.45 * shares[top], 3),
            modality="fused" if (optical is not None and sar is not None) else
                     ("optical" if optical is not None else "sar"),
            method="spectral index shares and backscatter share, compared",
            supporting=[f"{k}: {v*100:.1f}%" for k, v in
                        sorted(shares.items(), key=lambda kv: -kv[1])]))
        return es

    @staticmethod
    def _intent(q: str) -> str:
        if re.search(r"how many|count|number of", q):
            return "count"
        # Before presence: "how much vegetation is there?" contains "is there",
        # and was answered "yes." — a presence reply to a quantity question,
        # on one of the workstation's own example queries.
        if re.search(r"how much", q):
            return "area"
        if re.search(r"is there|are there|does .* (contain|have)|any ", q):
            return "presence"
        if re.search(r"how much|area|hectare|extent|coverage", q):
            return "area"
        if re.search(r"describ|summar|overview|what('s| is| does)? (in|on|shown)|"
                     r"what does .* (show|contain)|tell me about", q):
            return "describe"
        return "dominant"


# --------------------------------------------------------------------------- #
# M3 — bi-temporal change
# --------------------------------------------------------------------------- #

class Change(Specialist):
    """Change detection and change VQA over a bi-temporal pair.

    Change Vector Analysis across all shared bands, Otsu-split, morphologically
    cleaned, then labelled. Reports what changed, where, and how much — levels
    1 to 4 of the change hierarchy. Level 5, the interpretation, is left to the
    answer layer, which is handed these numbers.
    """

    def __init__(self) -> None:
        super().__init__(name="change_vqa", model="adapter_C_change")

    def run(self, t1: Raster, t2: Raster, question: str = "",
            threshold: float = 0.45) -> EvidenceSet:
        es = EvidenceSet(threshold=threshold)

        reg = coregistration_offset(t1, t2)
        if not reg["same_shape"]:
            es.add(self._ev(claim="pair not comparable", confidence=0.0,
                            method="shape mismatch",
                            conflicts=[f"{t1.shape_hw} vs {t2.shape_hw}"]))
            return es

        mag = cv.change_vector(t1.data, t2.data)
        mag = cv.box_blur(mag, 1)
        thr = cv.otsu(mag)
        mask = cv.opening(mag >= thr, 1)
        mask = cv.closing(mask, 2)

        labels, n = cv.connected_components(mask)
        props = cv.region_props(labels, n, min_area=80)
        # Misalignment is judged once, by the pipeline (validate.coregistration),
        # with one tolerance and one penalty. Judging it here as well charged
        # change queries twice, at two different tolerances.
        conf = confidence_from_separation(mag, thr)

        area_ha = mask_area_ha(mask, t2.transform, t2.georeferenced)
        total_ha = mask_area_ha(np.ones_like(mask, bool), t2.transform, t2.georeferenced)

        direction, semantics = self._semantics(t1, t2, mask)

        ev = self._ev(
            claim="change detected between the two dates" if props
                  else "no significant change detected",
            value=len(props), unit="regions",
            confidence=conf if props else max(0.35, conf - 0.15),
            modality="temporal",
            boxes=boxes_from_props(props, t2.transform, georeferenced=t2.georeferenced),
            mask_area_ha=area_ha,
            method="change vector analysis, Otsu threshold, morphological clean",
            supporting=[
                (f"changed area {area_ha:.2f} ha of {total_ha:.2f} ha "
                 f"({mask.mean() * 100:.2f}%)" if t2.georeferenced else
                 f"changed area {int(mask.sum())} px of {mask.size} px "
                 f"({mask.mean() * 100:.2f}%); not georeferenced, so no ground area"),
                f"otsu threshold {thr:.4f}",
                f"co-registration offset {reg['offset_px']:.2f} px",
                semantics,
                f"path: {self.path}"])
        es.add(ev)

        if direction is not None:
            es.add(self._ev(
                claim="built-up area trend", value=round(direction, 3), unit="%",
                confidence=conf, modality="temporal",
                method="built-up share at T2 minus built-up share at T1",
                supporting=[semantics]))
        return es

    @staticmethod
    def _semantics(t1: Raster, t2: Raster, mask: np.ndarray) -> tuple[float | None, str]:
        """What kind of change, using NDVI as the discriminant.

        Vegetation lost inside the changed region is the signature of
        construction; vegetation gained is regrowth. This is the difference
        between reporting *that* pixels changed and reporting *what* changed.
        """
        if not (t1.has("nir") and t1.has("red") and t2.has("nir") and t2.has("red")):
            return None, "no NIR/red pair — change type not classified"
        v1 = cv.ndvi(t1.named("nir"), t1.named("red"))
        v2 = cv.ndvi(t2.named("nir"), t2.named("red"))
        if mask.sum() < 10:
            return 0.0, "changed area too small to classify"
        d = float((v2[mask] - v1[mask]).mean())
        built_1 = float((v1 < 0.15).mean()) * 100
        built_2 = float((v2 < 0.15).mean()) * 100
        if d < -0.05:
            kind = "vegetation lost inside the changed region — consistent with construction"
        elif d > 0.05:
            kind = "vegetation gained inside the changed region — consistent with regrowth"
        else:
            kind = "no consistent vegetation trend inside the changed region"
        return built_2 - built_1, f"{kind} (mean NDVI delta {d:+.3f})"


# --------------------------------------------------------------------------- #
# M4 — optical-SAR fusion
# --------------------------------------------------------------------------- #

class Fusion(Specialist):
    """Cross-modal extraction from a co-registered optical-SAR pair.

    Late fusion per ADR-005: each modality is analysed independently and the
    *conclusions* are combined, which keeps per-modality evidence separable.
    That separability is what makes the requirement demonstrable — the answer
    can state what each sensor contributed, and quantify what neither gave
    alone.

    The core measurement: structures that SAR detects where the optical scene
    is obscured by cloud. Those are recovered by radar and by nothing else, and
    the count is the proof that the two sensors are complementary rather than
    redundant.
    """

    def __init__(self) -> None:
        super().__init__(name="optical_sar", model="fusion_late_v0")

    def run(self, optical: Raster, sar: Raster, query: str = "",
            threshold: float = 0.45) -> EvidenceSet:
        es = EvidenceSet(threshold=threshold)

        reg = coregistration_offset(optical, sar)
        es.add(self._ev(
            claim="co-registration verified" if reg["offset_px"] <= TOLERANCE_PX
                  else "co-registration outside tolerance",
            value=reg["offset_px"], unit="px",
            confidence=0.95 if reg["offset_px"] <= TOLERANCE_PX else 0.30,
            modality="fused", method="geometric extent + phase correlation",
            supporting=[f"geometric {reg['geometric_px']:.2f} px",
                        f"phase {reg['phase_px']:.2f} px",
                        f"same CRS: {reg['same_crs']}"]))

        # -- optical: where can we actually see? --------------------------- #
        cloud = cv.cloud_mask(optical.data)
        cloud = cv.closing(cv.opening(cloud, 1), 2)
        cloud_pct = float(cloud.mean() * 100)
        es.add(self._ev(
            claim="optical scene obscured by cloud",
            value=round(cloud_pct, 2), unit="%",
            confidence=0.88, modality="optical",
            mask_area_ha=mask_area_ha(cloud, optical.transform, optical.georeferenced),
            method="brightness and spectral flatness across visible bands",
            supporting=[f"{cloud.sum():,} px of {cloud.size:,}"]))

        # -- SAR: structures, everywhere, cloud or not --------------------- #
        vv = cv.lee_filter(sar.named("vv"), size=7, looks=4)
        thr = cv.otsu_multi(vv, classes=3)[-1]      # brightest mode only — see TARGETS
        hard = cv.opening(vv >= thr, 1)
        hard = cv.closing(hard, 1)
        labels, n = cv.connected_components(hard)
        scale = (sar.width * sar.height) / (512.0 * 512.0)
        min_area = max(12, int(48 * scale))
        props = cv.region_props(labels, n, min_area=min_area)
        sar_conf = confidence_from_separation(vv, thr)

        es.add(self._ev(
            claim="built-up areas detected by backscatter",
            value=len(props), unit="areas", confidence=sar_conf, modality="sar",
            boxes=boxes_from_props(props, sar.transform, georeferenced=sar.georeferenced),
            mask_area_ha=mask_area_ha(hard, sar.transform, sar.georeferenced),
            method="Lee filter, Otsu on backscatter, connected components",
            supporting=[f"threshold {thr:.4f} linear "
                        f"({cv.to_db(np.array([thr]))[0]:.1f} dB), "
                        "upper of a 3-class Otsu split",
                        "Lee filter 7x7, 4 looks — speckle is multiplicative",
                        "corner reflection from structures returns strongly",
                        f"path: {self.path}"]))

        # -- the complementarity measurement ------------------------------- #
        recovered = hard & cloud
        rec_labels, rec_n = cv.connected_components(recovered)
        rec_props = cv.region_props(rec_labels, rec_n, min_area=min_area)
        rec_ha = mask_area_ha(recovered, sar.transform, sar.georeferenced)
        share = (recovered.sum() / max(hard.sum(), 1)) * 100

        es.add(self._ev(
            claim="built-up areas recovered by SAR beneath cloud",
            value=len(rec_props), unit="areas",
            confidence=round(min(0.95, sar_conf * 0.96), 3),
            modality="fused",
            boxes=boxes_from_props(rec_props, sar.transform, georeferenced=sar.georeferenced),
            mask_area_ha=rec_ha,
            method="intersection of the SAR structure mask with the optical cloud mask",
            supporting=[
                f"{share:.1f}% of detected built-up area lies under cloud",
                f"{rec_ha:.2f} ha invisible to the optical sensor",
                "radar penetrates cloud; optical does not — this is the "
                "complementary information neither modality gives alone"]))

        # -- agreement where both can see ---------------------------------- #
        clear = ~cloud
        if clear.sum() > 100 and optical.has("nir") and optical.has("red"):
            veg = cv.ndvi(optical.named("nir"), optical.named("red")) > 0.28
            disagree = (hard & clear & veg)
            rate = float(disagree.sum()) / max(int((hard & clear).sum()), 1)
            ev = self._ev(
                claim="cross-modal agreement in clear sky",
                value=round((1 - rate) * 100, 2), unit="%",
                confidence=round(0.60 + 0.35 * (1 - rate), 3), modality="fused",
                method="SAR structure mask against optical NDVI, cloud-free pixels only",
                supporting=[f"{(1-rate)*100:.1f}% of clear-sky built-up pixels "
                            "are not vegetated in the optical scene"])
            if rate > 0.25:
                ev.conflicts.append(
                    f"{rate*100:.1f}% of SAR built-up pixels fall on optically "
                    "vegetated ground — possible volume scattering or misregistration")
            es.add(ev)
        return es
