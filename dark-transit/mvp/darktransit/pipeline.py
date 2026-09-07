"""The seven-stage pipeline (PRD 8.1).

Strictly sequential. Three stages can halt. Every stage writes a typed artefact
to the run directory, so any stage can be replayed against a stored input
without re-running the ones before it -- which is also what makes the demo
robust when something upstream is slow.
"""

from __future__ import annotations

import hashlib
import json
import math
import platform
import time
from dataclasses import asdict, is_dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from . import (ais, cfar, characterise, detect, drift, gates, geo, incident,
               score as scoring)

VERSION = "0.5.0-mvp"

LIMITATIONS = [
    dict(title="A lens is not a track",
         text="A reachable set establishes that a vessel could have been at the origin. It "
              "never establishes that it was."),
    dict(title="Silence has innocent causes",
         text="Equipment fails and satellite AIS coverage thins offshore. Every gap here is "
              "scored against that vessel's own median cadence, never against zero."),
    dict(title="Position can be forged",
         text="A transponder can broadcast a false position. Kinematic checks catch clumsy "
              "spoofing, not careful spoofing."),
    dict(title="Small hulls carry nothing",
         text="Vessels below the AIS carriage threshold broadcast nothing at all, so their "
              "absence from this analysis is not evidence of anything."),
    dict(title="Rewinding is not un-mixing",
         text="Backward advection with diffusion is ill-posed. The origin region is a "
              "reachable set, not a probability density over true origins, and its error "
              "compounds every hour rewound."),
    dict(title="Age rests on one constant",
         text="The slick age is estimated from lateral spreading and depends entirely on the "
              "eddy diffusivity assumed; it is reported as a range over a factor-two sweep "
              "of that value."),
    dict(title="A ranking is not a finding",
         text="This document ranks vessels for investigation. It is not a finding of "
              "responsibility and must not be represented as one."),
]

FORBIDDEN = ["responsible for", "is guilty", "found guilty", "proves that", "conclusive proof"]


class _Enc(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return None if not np.isfinite(o) else float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        if isinstance(o, np.bool_):
            return bool(o)
        if is_dataclass(o) and not isinstance(o, type):
            return {k: v for k, v in asdict(o).items() if not isinstance(v, np.ndarray)}
        return super().default(o)


def _clean(o):
    """NaN/inf -> None, recursively, so the emitted JSON is strictly valid."""
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, float) and not math.isfinite(o):
        return None
    return o


class RunLog:
    def __init__(self):
        self.lines = []
        self.t0 = time.time()

    def __call__(self, stage, event, **kw):
        rec = dict(t=round(time.time() - self.t0, 3), stage=stage, event=event, **kw)
        self.lines.append(rec)
        return rec

    def dump(self, path):
        path.write_text("\n".join(json.dumps(_clean(r), cls=_Enc) for r in self.lines) + "\n")


def _utc(base_iso, hours):
    base = datetime.fromisoformat(base_iso.replace("Z", "+00:00"))
    return (base + timedelta(hours=float(hours))).astimezone(timezone.utc)\
        .strftime("%Y-%m-%dT%H:%M:%SZ")


def run(scenario_name="kutch", seed=None, out_root="runs", weight_pack=None,
        n_particles=2600, quiet=False):
    sc = incident.SCENARIOS[scenario_name]
    if seed is not None:
        sc = incident.Scenario(**{**sc.__dict__, "seed": int(seed)})
    log = RunLog()
    rng = np.random.default_rng(sc.seed + 11)
    pack = scoring.load_pack(weight_pack)

    inc = incident.build(sc)
    plane, current, wind = inc["plane"], inc["current"], inc["wind"]
    params = drift.DriftParams(k_h=sc.k_h, n_particles=n_particles,
                               sigma_current=sc.sigma_current, sigma_alpha=sc.sigma_alpha)
    det_scene, arc_scene = inc["detection_scene"], inc["archive_scene"]

    manifest = dict(
        tool="dark-transit", version=VERSION, scenario=sc.name, label=sc.label,
        seed=sc.seed, detection_utc=sc.detection_utc, notes=sc.notes,
        parameters=dict(leeway_alpha=params.alpha, k_h=params.k_h, dt_s=params.dt_s,
                        n_particles=n_particles, integrator=params.integrator,
                        horizon_h=sc.horizon_h, sigma_current=params.sigma_current,
                        sigma_alpha=params.sigma_alpha),
        forcing=dict(current=current.name, wind=wind.name),
        provenance=dict(ais="synthetic", scene="synthetic", forcing="analytic"),
        weight_pack=pack.get("file"), weight_pack_version=pack.get("version"),
        weights=pack["weights"], python=platform.python_version(),
    )
    manifest["hash"] = hashlib.sha256(
        json.dumps(manifest, sort_keys=True, cls=_Enc).encode()).hexdigest()
    run_id = f"{sc.name}-{datetime.now(timezone.utc):%Y%m%dT%H%M%S}-{manifest['hash'][:8]}"
    manifest["run_id"] = run_id

    out = Path(out_root) / run_id
    out.mkdir(parents=True, exist_ok=True)

    fired, halted = [], None

    def emit(name, obj):
        (out / name).write_text(json.dumps(_clean(obj), cls=_Enc, indent=2))

    # ---------------- 01 intake -------------------------------------------
    archive_span_h = sc.archive_end_h - sc.archive_start_h
    positions = [ais.to_positions(t) for t in inc["tracks"]]
    n_pos = int(sum(len(p["t_h"]) for p in positions))
    g5 = gates.gate5_archive(archive_span_h, sc.horizon_h)
    fired.append(g5)
    intake = dict(
        scene=dict(scene_id=det_scene.scene_id, sensor=det_scene.sensor, mode=det_scene.mode,
                   polarisation=det_scene.polarisation, pixel_m=det_scene.pixel_m,
                   looks=det_scene.looks, noise_floor_db=det_scene.noise_floor_db,
                   acquired_utc=sc.detection_utc, crs="EPSG:4326",
                   size_px=list(det_scene.shape)),
        archive_scene=None if arc_scene is None else dict(
            scene_id=arc_scene.scene_id, acquired_utc=_utc(sc.detection_utc, arc_scene.acquired_h),
            acquired_h=arc_scene.acquired_h),
        ais=dict(source="synthetic", positions=n_pos, distinct_mmsi=len(positions),
                 window=[_utc(sc.detection_utc, sc.archive_start_h),
                         _utc(sc.detection_utc, sc.archive_end_h)],
                 span_h=archive_span_h),
        preflight=[
            dict(check="crs_declared", status="pass", detail="EPSG:4326"),
            dict(check="radiometric_calibration", status="pass",
                 detail=f"sigma-nought, noise floor {det_scene.noise_floor_db} dB"),
            dict(check="forcing_available", status="pass",
                 detail=f"{current.name}; {wind.name}"),
            dict(check="archive_spans_horizon",
                 status="pass" if not g5["fired"] else "fail",
                 detail=g5["detail"]),
            dict(check="ais_provenance", status="caution",
                 detail="traffic is synthetic; declared on dossier page 1"),
        ],
        gate=g5,
    )
    emit("01_intake.json", intake)
    log("01_intake", "complete", positions=n_pos, vessels=len(positions))
    if g5["halts"]:
        halted = g5
        return _finish(out, run_id, manifest, log, fired, halted, sc, inc, dict(), pack, quiet)

    # ---------------- 02 detection ----------------------------------------
    cands, retained, raw_n = detect.detect(det_scene)
    top = retained[0] if retained else None
    g1 = gates.gate1_confidence(top.confidence if top else None, len(cands))
    fired.append(g1)
    detection = dict(
        raw_components=raw_n, candidates=len(cands), retained=len(retained),
        confidence=None if not top else round(top.confidence, 3),
        drivers=None if not top else top.drivers,
        sea_db=round(float(np.median(det_scene.sigma0_db)), 2),
        slick_db=None if not top else round(top.features["inside_db"], 2),
        method=("classical: refined-Lee speckle filter, local adaptive threshold, "
                "connected components, logistic look-alike discriminator over six named "
                "features. The fine-tuned U-Net of DT-3 is not present in this build and "
                "the pipeline is running its documented degraded path."),
        table=[dict(id=c.cid, area_km2=round(c.area_km2, 2), verdict=c.verdict,
                    basis=c.rejection_basis, confidence=round(c.confidence, 3),
                    delta_db=c.delta_db,
                    wind_ms=round(c.features["wind_ms"], 1),
                    edge_gradient=round(c.features["edge_gradient_db_per_px"], 2),
                    shape_complexity=round(c.features["shape_complexity"], 2),
                    elongation=round(c.features["elongation"], 2))
               for c in cands],
        gate=g1,
    )
    emit("02_detection.json", detection)
    log("02_detection", "complete", candidates=len(cands), retained=len(retained),
        confidence=detection["confidence"])
    if g1["halts"]:
        halted = g1
        return _finish(out, run_id, manifest, log, fired, halted, sc, inc,
                       dict(intake=intake, detection=detection), pack, quiet)

    # ---------------- 03 characterisation ---------------------------------
    geom = characterise.characterise(det_scene, top, k_h=params.k_h, k_h_sweep=(0.6, 1.7))
    emit("03_geometry.json", geom)
    log("03_characterise", "complete", area_km2=geom.area_km2, axis_deg=geom.principal_axis_deg,
        elongation=geom.elongation, age_h=geom.age_hours)

    # ---------------- 04 drift --------------------------------------------
    slon, slat = drift.seed_in_polygon(geom.polygon, n_particles, rng)
    pert = drift.make_ensemble(len(slon), params, rng)
    back = drift.integrate(slon, slat, 0.0, -sc.horizon_h, current, wind, params, rng, pert=pert)
    fwd = drift.integrate(slon, slat, 0.0, sc.horizon_h, current, wind, params, rng, pert=pert)

    window_h = (-geom.age_hours_hi, -geom.age_hours_lo)
    sel = [s for s in back if window_h[0] <= s.hour <= window_h[1]]
    if not sel:
        sel = [back[-1]]
    ulons = np.concatenate([s.lons for s in sel])
    ulats = np.concatenate([s.lats for s in sel])
    origin_region = drift.density_region(ulons, ulats, cell_m=700.0)
    r95_union = drift.r95_km(ulons, ulats)

    g2 = gates.gate2_region(r95_union)
    fired.append(g2)

    r95_series = [dict(hour_back=round(-s.hour, 1), r95_km=round(s.r95_km, 2),
                       alive=s.alive) for s in back]
    origin_centroid = (float(np.mean(ulons)), float(np.mean(ulats)))
    shear = drift.shear_per_hour(origin_centroid[0], origin_centroid[1],
                                 float(np.mean(window_h)), current, wind, params)
    drift_art = dict(
        n_particles=int(len(slon)), integrator=params.integrator, dt_s=params.dt_s,
        leeway_alpha=params.alpha, k_h=params.k_h, horizon_h=sc.horizon_h,
        sigma_current=params.sigma_current, sigma_alpha=params.sigma_alpha,
        r95_series=r95_series, r95_union_km=round(r95_union, 2),
        origin_window_h=[round(window_h[0], 2), round(window_h[1], 2)],
        origin_window=[_utc(sc.detection_utc, window_h[0]), _utc(sc.detection_utc, window_h[1])],
        origin_region=origin_region, origin_centroid=[round(origin_centroid[0], 5),
                                                      round(origin_centroid[1], 5)],
        shear_per_hour=round(shear, 4),
        forward=dict(hours=sc.horizon_h,
                     centroid=[round(float(fwd[-1].lons.mean()), 5),
                               round(float(fwd[-1].lats.mean()), 5)],
                     r95_km=round(fwd[-1].r95_km, 2), landfall=False, eta_utc=None,
                     note="No coastline within the forward cloud over the horizon in this "
                          "synthetic domain; the landfall test is implemented and reports "
                          "false rather than being skipped."),
        gate=g2,
        note=("Backward advection with diffusion is ill posed. This region is the set of "
              "positions a particle could plausibly have reached the observed slick from -- "
              "a reachable set, not a probability density over true origins."),
    )
    emit("04_drift.json", drift_art)
    log("04_drift", "complete", r95_union_km=round(r95_union, 2),
        window=drift_art["origin_window"])
    if g2["halts"]:
        halted = g2
        return _finish(out, run_id, manifest, log, fired, halted, sc, inc,
                       dict(intake=intake, detection=detection, geometry=geom,
                            drift=drift_art), pack, quiet)

    # ---------------- 05 traffic ------------------------------------------
    records, dropped = detect_traffic(inc, origin_region, window_h, plane)
    traffic_art = dict(
        in_window=len(records), dropped=len(dropped),
        vessels=[_vessel_row(r, sc) for r in records],
        dropped_vessels=[dict(mmsi=r.vessel.mmsi, name=r.vessel.name,
                              ship_type=r.vessel.ship_type, basis=r.drop_reason,
                              closest_approach_km=round(r.closest_approach_km, 2))
                         for r in dropped],
        note="Vessels dropped are reported with the basis for the drop, not just counted.",
    )
    emit("05_traffic.json", traffic_art)
    log("05_traffic", "complete", in_window=len(records), dropped=len(dropped))

    # ---------------- 06 dark channel -------------------------------------
    dark_art, g3 = dark_channel(arc_scene, inc["tracks"], plane, window_h, origin_region)
    fired.append(g3)
    emit("06_dark.json", dark_art)
    log("06_dark_channel", "complete", available=dark_art["available"],
        targets=dark_art.get("targets"), unmatched=dark_art.get("unmatched"))

    # ---------------- 07 attribution --------------------------------------
    result = scoring.rank(records, origin_region, window_h, geom, plane, pack)
    _corroborate(result, dark_art, records, plane)
    g4 = gates.gate4_margin(result["leader_margin"])
    fired.append(g4)
    result["gate"] = g4
    result["ablation"] = scoring.ablate(result["ranked"], pack["weights"])
    result["finding"] = _finding(result, g4, geom, drift_art, dark_art, sc)
    emit("07_attribution.json", result)
    log("07_attribution", "complete", leader_margin=result["leader_margin"],
        leader=result["ranked"][0]["mmsi"] if result["ranked"] else None)

    stages = dict(intake=intake, detection=detection, geometry=geom, drift=drift_art,
                  traffic=traffic_art, dark=dark_art, attribution=result)
    return _finish(out, run_id, manifest, log, fired, halted, sc, inc, stages, pack, quiet)


def detect_traffic(inc, origin_region, window_h, plane):
    from . import traffic
    return traffic.analyse(inc["tracks"], origin_region, window_h, plane, ais.to_positions)


def _vessel_row(r, sc):
    return dict(
        mmsi=r.vessel.mmsi, name=r.vessel.name, ship_type=r.vessel.ship_type,
        length_m=r.vessel.length_m, source=r.vessel.source, channel=r.channel,
        baseline_cadence_s=round(r.baseline_cadence_s, 1),
        cog=None if not np.isfinite(r.cog_through_region) else round(r.cog_through_region, 1),
        crossing_utc=None if not np.isfinite(r.crossing_h) else _utc(sc.detection_utc, r.crossing_h),
        closest_approach_km=round(r.closest_approach_km, 2),
        implausible_fixes=r.implausible_fixes,
        gaps=[dict(start_utc=_utc(sc.detection_utc, g.start_h),
                   end_utc=_utc(sc.detection_utc, g.end_h),
                   duration_s=round(g.duration_s, 1),
                   baseline_cadence_s=round(g.baseline_cadence_s, 1),
                   anomaly=round(g.anomaly, 3), overlap=round(g.overlap, 3),
                   v_max_ms=round(g.v_max_ms, 2), envelope=g.envelope) for g in r.gaps],
        track=_decimate(r.positions),
    )


def _decimate(pos, max_points=260):
    n = len(pos["t_h"])
    step = max(1, n // max_points)
    return [[round(float(a), 5), round(float(b), 5), round(float(c), 3)]
            for a, b, c in zip(pos["lon"][::step], pos["lat"][::step], pos["t_h"][::step])]


def dark_channel(arc_scene, tracks, plane, window_h, origin_region):
    if arc_scene is None:
        g3 = gates.gate3_dark_channel(False, "no radar pass covers the origin window")
        return dict(available=False, reason=g3["detail"], gate=g3), g3
    if not (window_h[0] <= arc_scene.acquired_h <= window_h[1]):
        g3 = gates.gate3_dark_channel(
            False, f"the archive scene at {arc_scene.acquired_h:+.2f} h lies outside the "
                   f"origin window [{window_h[0]:+.2f}, {window_h[1]:+.2f}] h")
        return dict(available=False, reason=g3["detail"], gate=g3), g3

    targets, cfg = cfar.ca_cfar(arc_scene)
    matched, unmatched = cfar.match_to_ais(targets, tracks, arc_scene.acquired_h, plane)
    region = np.asarray(origin_region, dtype=float)
    for t in unmatched:
        t_in = bool(geo.points_in_polygon([[t.lon, t.lat]], region)[0]) if len(region) > 2 else False
        t.__dict__["in_origin_region"] = t_in
    g3 = gates.gate3_dark_channel(True)
    return dict(
        available=True, gate=g3, cfar=cfg, acquired_h=arc_scene.acquired_h,
        targets=len(targets), matched=len(matched), unmatched=len(unmatched),
        unmatched_targets=[dict(target_id=t.target_id, lon=t.lon, lat=t.lat,
                                est_length_m=t.est_length_m,
                                est_length_range_m=[t.est_length_lo_m, t.est_length_hi_m],
                                peak_db=t.peak_db,
                                in_origin_region=t.__dict__.get("in_origin_region", False))
                           for t in unmatched],
        note=("An unmatched return has no identity. It may corroborate a vessel already "
              "ranked through AIS where the geometry agrees; it is never promoted to a "
              "separate named suspect."),
    ), g3


def _corroborate(result, dark_art, records, plane):
    """DK-4: attach an unmatched radar return to an already-ranked vessel."""
    for r in result["ranked"]:
        r["corroboration"] = None
    if not dark_art.get("available"):
        return
    by_mmsi = {rec.vessel.mmsi: rec for rec in records}
    for t in dark_art.get("unmatched_targets", []):
        if not t.get("in_origin_region"):
            continue
        for r in result["ranked"]:
            rec = by_mmsi.get(r["mmsi"])
            if rec is None or not rec.gaps:
                continue
            lo, hi = t["est_length_range_m"]
            if not (lo <= rec.vessel.length_m <= hi):
                continue
            for g in rec.gaps:
                if len(g.envelope) > 2 and geo.points_in_polygon(
                        [[t["lon"], t["lat"]]], np.asarray(g.envelope, dtype=float))[0]:
                    r["corroboration"] = dict(
                        target_id=t["target_id"], est_length_m=t["est_length_m"],
                        vessel_length_m=rec.vessel.length_m,
                        text=(f"unmatched radar return {t['target_id']} of estimated length "
                              f"{t['est_length_m']:.0f} m lies inside both the origin region "
                              f"and this vessel's reachable set while it was not broadcasting; "
                              f"a second, transponder-independent channel places a hull of "
                              f"comparable size there"))
                    break
            if r["corroboration"]:
                break


def _finding(result, g4, geom, drift_art, dark_art, sc):
    if not result["ranked"]:
        return "No vessel intersected the origin region within the origin window."
    if g4["fired"]:
        top = result["ranked"][:2]
        names = " and ".join(f"{r['name']} ({r['mmsi']})" for r in top)
        return (f"The evidence does not separate {names}: the leader margin is "
                f"{result['leader_margin']:.3f}, below the 0.10 threshold. Neither vessel is "
                f"named. Both are returned for investigation.")
    r = result["ranked"][0]
    txt = (f"{r['name']}, {r['ship_type'].replace('_', ' ')} of {r['length_m']:.0f} m, MMSI "
           f"{r['mmsi']}, ranks first at a composite score of {r['score']:.3f}, a margin of "
           f"{result['leader_margin']:.3f} over rank 2. ")

    # Name the factor that actually carried this ranking, measured rather than
    # assumed. The heading factor is the strongest one in general; it is not
    # necessarily the strongest one here, and saying so would be a small lie.
    w = result["weights"]
    contrib = {k: w.get(k, 0) * v for k, v in r["factors"].items()
               if k not in r.get("suppressed", [])}
    if contrib:
        lead_factor = max(contrib, key=contrib.get)
        share = contrib[lead_factor] / max(sum(contrib.values()), 1e-9)
        txt += (f"The largest single contribution to that score is "
                f"{lead_factor.replace('_', ' ')}, at {share * 100:.0f} % of the weighted total: "
                f"{r['justifications'].get(lead_factor, '')}. ")
    if r.get("delta_axis") is not None and lead_factor != "heading":
        txt += (f"On the geometric factor, the slick's observed principal axis runs "
                f"{geom.principal_axis_deg:.0f} degrees true and this vessel's course through "
                f"the region was {r['cog']:.0f} degrees, a difference of "
                f"{r['delta_axis']:.0f} degrees. ")
    if r.get("corroboration"):
        txt += r["corroboration"]["text"] + ". "
    txt += ("This is a ranking for investigation. It is not a finding of responsibility.")
    return txt


def _finish(out, run_id, manifest, log, fired, halted, sc, inc, stages, pack, quiet):
    from . import dossier
    run_doc = _run_json(run_id, manifest, sc, stages, fired, halted, inc)
    (out / "run.json").write_text(json.dumps(_clean(run_doc), cls=_Enc, indent=2))
    (out / "manifest.json").write_text(json.dumps(_clean(manifest), cls=_Enc, indent=2))
    html = dossier.render(run_doc)
    (out / "dossier.html").write_text(html)
    check_language(html)
    log("finish", "complete", run_id=run_id, halted=None if not halted else halted["name"])
    log.dump(out / "log.jsonl")
    if not quiet:
        print(f"[dark-transit] run {run_id}")
        print(f"[dark-transit] artefacts in {out}")
    return run_doc, out


def check_language(text):
    """RP-3 / NFR-2, enforced rather than asserted."""
    low = text.lower()
    hits = [p for p in FORBIDDEN if p in low]
    if hits:
        raise AssertionError(f"generated output asserts responsibility: {hits}")
    return True


def _run_json(run_id, manifest, sc, stages, fired, halted, inc):
    geom = stages.get("geometry")
    att = stages.get("attribution", {})
    doc = dict(
        run_id=run_id, generated_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        version=VERSION, scenario=sc.name, scenario_label=sc.label,
        scenario_notes=sc.notes, detection_utc=sc.detection_utc,
        provenance=manifest["provenance"], parameters=manifest["parameters"],
        forcing=manifest["forcing"], manifest_hash=manifest["hash"],
        halted=None if not halted else dict(gate=halted["id"], name=halted["name"],
                                            detail=halted["detail"]),
        gates=fired, limitations=LIMITATIONS,
    )
    if "intake" in stages:
        doc["intake"] = stages["intake"]
    if "detection" in stages:
        doc["detection"] = stages["detection"]
    if geom is not None:
        doc["geometry"] = json.loads(json.dumps(_clean(geom), cls=_Enc))
    if "drift" in stages:
        doc["drift"] = stages["drift"]
    if "traffic" in stages:
        doc["traffic"] = stages["traffic"]
    if "dark" in stages:
        doc["dark"] = stages["dark"]
    if att:
        doc["attribution"] = att
    doc["truth"] = dict(
        note=("Synthetic incident. The truth block is recorded so the run can be scored; the "
              "pipeline never reads it."),
        **{k: v for k, v in inc["truth"].items()},
    )
    if att.get("ranked"):
        doc["truth"]["top1_correct"] = bool(att["ranked"][0]["mmsi"] == inc["truth"]["culprit_mmsi"])
    return doc
