"""Fitting the look-alike discriminator, and measuring it (DT-3, DT-4, PRD 17).

The MVP shipped with the six logistic coefficients hand-set from the physics.
That was honest but weak: "we chose these numbers because they felt right" is
not a defensible answer to a technical judge, and PRD 17's detection targets
stayed targets because nothing had been measured.

This module generates a labelled corpus of scenes, fits the coefficients on a
training split, and reports precision, recall, false-alarm rate on look-alikes
and pixel IoU on a held-out split. The fitted pack is written to a versioned
JSON file that `detect` loads in preference to the hand-set constants.

It is not the U-Net of DT-3, and it does not pretend to be. It is a fitted
linear model over six physically-motivated features, trained on synthetic
scenes whose labels we control. What it buys is that every number in the
detection stage is now a measurement with a stated method, and the fitting
harness is the same one a real dataset would drop into: swap
`sample_scene` for a Zenodo reader and nothing downstream changes.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from . import detect, drift, forcing, geo, scene as scene_mod

FEATURES = ["edge_gradient_db_per_px", "contrast_db", "wind_ms",
            "shape_complexity", "homogeneity", "elongation"]

PACK_VERSION = "v1"

# What the physics says each coefficient's sign should be. The fit is not
# constrained to obey these -- the point is to notice when it does not, because
# a coefficient that fights the physics is the model exploiting an artefact of
# the simulator rather than learning the phenomenon.
EXPECTED_SIGN = {
    "edge_gradient_db_per_px": +1,   # a film has a physical edge
    "contrast_db": +1,               # oil damps hard
    "wind_ms": +1,                   # below ~3 m/s dark means calm, not oil
    "shape_complexity": -1,          # blooms are raggeder than films
    "homogeneity": -1,               # a slick is uniformly dark
    "elongation": +1,                # a discharge under way is a line source
}


def wilson(k, n, z=1.96):
    """Wilson score interval. A recall of 0.5 from 8 positives and a recall of
    0.5 from 200 are different claims, and the interval is what says so."""
    if n == 0:
        return [None, None]
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(max(0.0, c - h), 4), round(min(1.0, c + h), 4)]


def sample_scene(rng, with_oil=True):
    """One randomised labelled scene: forcing, a plume, look-alikes, land.

    Deliberately lighter than `incident.build` -- no AIS, no archive scene --
    because fitting needs many scenes and none of the traffic machinery.
    """
    lon0 = 69.20 + rng.uniform(-0.3, 0.3)
    lat0 = 22.45 + rng.uniform(-0.2, 0.2)
    plane = geo.TangentPlane(lat0, lon0)
    hours = np.arange(-30.0, 6.0, 1.0)
    bbox = (lon0 - 1.4, lat0 - 1.1, lon0 + 1.4, lat0 + 1.1)

    base_wind = rng.uniform(5.2, 9.5)
    n_cells = int(rng.integers(1, 4))
    cells = [(lon0 + rng.uniform(-0.35, 0.45), lat0 + rng.uniform(-0.3, 0.35),
              rng.uniform(14.0, 24.0), rng.uniform(3.4, base_wind - 1.6))
             for _ in range(n_cells)]
    wind = forcing.make_wind(bbox, hours, base_speed=base_wind,
                             base_dir_deg=rng.uniform(20, 110), low_wind_cells=cells)
    current = forcing.make_current(bbox, hours, mean_speed=rng.uniform(0.16, 0.36),
                                   mean_dir_deg=rng.uniform(40, 100))

    slick = None
    age_h = float(rng.uniform(4.0, 16.0))
    if with_oil:
        params = drift.DriftParams(k_h=float(rng.uniform(2.5, 9.0)))
        n = 4000
        dur = float(rng.uniform(0.15, 0.55))
        cog = float(rng.uniform(0, 360))
        v = float(rng.uniform(8.0, 15.0)) * 0.514444
        t_rel = np.linspace(-age_h - dur / 2, -age_h + dur / 2, n)
        d = (t_rel + age_h) * 3600.0 * v
        sx = d * math.sin(math.radians(cog))
        sy = d * math.cos(math.radians(cog))
        rlon, rlat = plane.to_lonlat(sx, sy)
        snaps = drift.integrate(rlon, rlat, -age_h, age_h, current, wind, params,
                                np.random.default_rng(int(rng.integers(1 << 30))))
        slick = (snaps[-1].lons, snaps[-1].lats)

    n_bio = int(rng.integers(1, 4))
    biogenic = []
    for _ in range(n_bio):
        b = plane.to_lonlat(np.array([rng.uniform(-22000, 22000)]),
                            np.array([rng.uniform(-22000, 22000)]))
        # damping overlaps the oil range and the edge can be sharp, so the two
        # populations genuinely intersect in feature space
        biogenic.append((float(b[0][0]), float(b[1][0]),
                         rng.uniform(2600, 6000), rng.uniform(1800, 3800),
                         rng.uniform(0, 180), rng.uniform(6.5, 13.5),
                         float(rng.uniform(220.0, 1400.0))))

    ships = []
    for _ in range(int(rng.integers(0, 5))):
        q = plane.to_lonlat(np.array([rng.uniform(-28000, 28000)]),
                            np.array([rng.uniform(-28000, 28000)]))
        ships.append((float(q[0][0]), float(q[1][0]), float(rng.uniform(40, 280))))

    centre = (float(np.mean(slick[0])), float(np.mean(slick[1]))) if slick else (lon0, lat0)
    sc = scene_mod.make_scene(
        f"FIT-{int(rng.integers(1 << 24)):06x}", centre[0], centre[1], 30000.0, 100.0, 0.0,
        wind, slick_lonlat=slick, slick_damping_db=float(rng.uniform(6.0, 15.0)),
        biogenic=biogenic, ship_lonlat=ships,
        rng=np.random.default_rng(int(rng.integers(1 << 30))))
    return sc


def label_candidates(sc, cands, min_iou=0.30):
    """Label each candidate against the scene's truth oil mask.

    IoU rather than centroid containment: a candidate that swallows the slick
    plus half the scene is not a detection, and centroid tests would call it
    one.
    """
    truth = sc.truth.get("oil_mask")
    out = []
    for c in cands:
        if truth is None:
            out.append(0)
            continue
        inter = int((c.mask & truth).sum())
        union = int((c.mask | truth).sum())
        out.append(1 if union and inter / union >= min_iou else 0)
    return out


def collect(n_scenes=48, oil_fraction=0.75, seed=4242, verbose=True):
    """Generate scenes, extract candidates, return (X, y, groups, ious)."""
    rng = np.random.default_rng(seed)
    X, y, groups, ious = [], [], [], []
    for i in range(n_scenes):
        with_oil = rng.random() < oil_fraction
        sc = sample_scene(rng, with_oil=with_oil)
        cands, filtered, _ = detect.candidates(sc)
        for c in cands:
            c.features = detect.features(sc, c, filtered)
        labels = label_candidates(sc, cands)
        truth = sc.truth.get("oil_mask")
        for c, lab in zip(cands, labels):
            X.append([c.features[k] for k in FEATURES])
            y.append(lab)
            groups.append(i)
            if truth is not None:
                u = int((c.mask | truth).sum())
                ious.append(int((c.mask & truth).sum()) / u if u else 0.0)
            else:
                ious.append(0.0)
        if verbose and (i + 1) % 8 == 0:
            print(f"  {i + 1}/{n_scenes} scenes, {len(X)} candidates, "
                  f"{int(np.sum(y))} positive")
    return np.array(X, dtype=float), np.array(y, dtype=int), np.array(groups), np.array(ious)


def fit_logistic(X, y, l2=1.0, iters=400, lr=0.35):
    """Standardise, then gradient descent on the L2-penalised log-loss.

    Small, convex, and 30 lines -- an optimiser dependency would buy nothing
    here. The standardisation statistics become the feature reference the
    detector ships with, so the z-scores at inference are the training ones.
    """
    mu = X.mean(axis=0)
    sd = X.std(axis=0)
    sd[sd < 1e-9] = 1.0
    Z = (X - mu) / sd
    n, d = Z.shape
    w = np.zeros(d)
    b = 0.0
    for _ in range(iters):
        z = Z @ w + b
        p = 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))
        gw = Z.T @ (p - y) / n + l2 * w / n
        gb = float(np.mean(p - y))
        w -= lr * gw
        b -= lr * gb
    return dict(mu=mu, sd=sd, w=w, b=float(b))


def predict(model, X):
    Z = (X - model["mu"]) / model["sd"]
    z = Z @ model["w"] + model["b"]
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def metrics(y, p, ious, threshold=0.50):
    """Candidate-level precision/recall plus the two numbers PRD 17 asks for."""
    pred = (p >= threshold).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum())
    fp = int(((pred == 1) & (y == 0)).sum())
    fn = int(((pred == 0) & (y == 1)).sum())
    tn = int(((pred == 0) & (y == 0)).sum())
    prec = tp / (tp + fp) if tp + fp else float("nan")
    rec = tp / (tp + fn) if tp + fn else float("nan")
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else float("nan")
    fpr = fp / (fp + tn) if fp + tn else float("nan")
    retained_iou = float(np.mean(ious[(pred == 1) & (y == 1)])) if tp else float("nan")
    return dict(n=int(len(y)), positives=int(y.sum()),
                tp=tp, fp=fp, fn=fn, tn=tn,
                precision=round(prec, 4), precision_ci95=wilson(tp, tp + fp),
                recall=round(rec, 4), recall_ci95=wilson(tp, tp + fn),
                f1=round(f1, 4),
                lookalike_fpr=round(fpr, 4), lookalike_fpr_ci95=wilson(fp, fp + tn),
                mean_iou_retained=round(retained_iou, 4),
                threshold=threshold)


def run_fit(n_scenes=48, seed=4242, out="detector.v1.json", verbose=True):
    """Fit, evaluate on a scene-disjoint holdout, write the pack."""
    if verbose:
        print(f"[fit] generating {n_scenes} labelled scenes")
    X, y, groups, ious = collect(n_scenes=n_scenes, seed=seed, verbose=verbose)
    if y.sum() < 8:
        raise SystemExit("not enough positive candidates to fit; raise --scenes")

    # Split by SCENE, never by candidate: two candidates from one scene share a
    # wind field and a speckle realisation, so a random candidate split would
    # leak and every metric would be optimistic.
    uniq = np.unique(groups)
    rng = np.random.default_rng(seed + 1)
    rng.shuffle(uniq)
    cut = int(0.7 * len(uniq))
    tr_scenes, te_scenes = set(uniq[:cut].tolist()), set(uniq[cut:].tolist())
    tr = np.array([g in tr_scenes for g in groups])
    te = ~tr

    model = fit_logistic(X[tr], y[tr])
    m_tr = metrics(y[tr], predict(model, X[tr]), ious[tr])
    m_te = metrics(y[te], predict(model, X[te]), ious[te])

    fitted = {k: float(v) for k, v in zip(FEATURES, model["w"])}
    sign_check = {
        k: dict(fitted=round(fitted[k], 4), expected_sign=EXPECTED_SIGN[k],
                agrees=bool(fitted[k] * EXPECTED_SIGN[k] > 0),
                magnitude=round(abs(fitted[k]), 4))
        for k in FEATURES}
    disagree = [k for k, v in sign_check.items() if not v["agrees"]]

    pack = dict(
        version=PACK_VERSION,
        file=str(out),
        method=("logistic regression over six physically-motivated features, "
                "L2-penalised, fitted by gradient descent on synthetic labelled "
                "scenes; split by scene, not by candidate"),
        features=FEATURES,
        feature_ref={k: [round(float(mu), 6), round(float(sd), 6)]
                     for k, mu, sd in zip(FEATURES, model["mu"], model["sd"])},
        beta={"intercept": round(model["b"], 6),
              **{k: round(float(v), 6) for k, v in zip(FEATURES, model["w"])}},
        training=dict(scenes=int(n_scenes), seed=int(seed),
                      candidates=int(len(y)), positives=int(y.sum()),
                      train_scenes=len(tr_scenes), test_scenes=len(te_scenes)),
        metrics=dict(train=m_tr, holdout=m_te),
        sign_check=sign_check,
        caveat=("Fitted on synthetic scenes generated by this repository, so these "
                "numbers measure the model against our own simulator and NOT against "
                "real Sentinel-1 imagery. They are a floor on method validity, not an "
                "accuracy claim. Refit on the Zenodo dataset before quoting any of "
                "this as detection performance."),
    )
    Path(out).write_text(json.dumps(pack, indent=2))
    pack["sign_disagreements"] = disagree
    Path(out).write_text(json.dumps(pack, indent=2))
    if verbose:
        print(f"[fit] wrote {out}")
        print(f"[fit] holdout: precision {m_te['precision']} {m_te['precision_ci95']} "
              f"recall {m_te['recall']} {m_te['recall_ci95']} "
              f"look-alike FPR {m_te['lookalike_fpr']} mean IoU {m_te['mean_iou_retained']}")
        if disagree:
            print(f"[fit] coefficients fighting the physics prior: {', '.join(disagree)}")
            print("[fit]   treat those as weakly identified, not as a finding")
    return pack
