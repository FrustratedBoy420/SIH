"""KAAL mock — deterministic stand-in for the real Earth Engine pipeline.

Produces the SAME output schema the real spike (spike/01_kaal_gee.py) will emit,
so the dossier generator + NYAYA engine work end-to-end BEFORE Earth Engine creds
are wired. Swap mock_kaal() for the real ee-based function once the spike runs.

Output schema (contract):
{
  claim_id, conversion_year, break_direction, trajectory_class,
  confidence, confidence_drivers{...},
  years[], ndvi[],            # annual time series for the breakpoint chart
  evidence_strip[{year,label,kind}],  # decade chips
  corona_available, registration_rmse_m
}
"""
from __future__ import annotations
import hashlib
import numpy as np


def _seed(claim_id: str) -> int:
    return int(hashlib.sha256(claim_id.encode()).hexdigest()[:8], 16)


def mock_kaal(claim: dict) -> dict:
    """Deterministic per-claim synthetic KAAL result.

    Models a forest->cultivation NDVI trajectory with a breakpoint, so the
    time series and the dated finding look like real LandTrendr output.
    """
    rng = np.random.default_rng(_seed(claim["claim_id"]))
    years = np.arange(1975, 2024)

    # Pick a conversion year. For most rejected 'no_pre_2005_proof' ST claims we
    # want a pre-2005 breakpoint (the whole point). Deterministic but varied.
    reason = (claim.get("rejection_order") or {}).get("reason_category")
    if reason == "no_pre_2005_proof":
        conv = int(rng.integers(1988, 2003))          # pre-cutoff
    elif reason == "boundary_dispute":
        conv = int(rng.integers(1990, 2010))
    else:
        conv = int(rng.integers(1985, 2015))

    # Build an NDVI trajectory: high (forest ~0.8) then drop to seasonal
    # cultivation (~0.4) after conversion, with noise. LandTrendr would segment this.
    ndvi = np.where(years < conv, 0.80, 0.42).astype(float)
    # gentle pre-decline + post variability
    ndvi += rng.normal(0, 0.03, size=years.shape)
    ndvi[years >= conv] += rng.normal(0, 0.05, size=(years >= conv).sum())
    ndvi = np.clip(ndvi, 0.05, 0.95)

    break_mag = 0.80 - 0.42
    valid_obs = int(rng.integers(22, 40))             # cloud-free years available
    rmse = round(float(rng.uniform(6, 14)), 1)        # Corona georef error (m)
    # Confidence: driven by obs count, break magnitude, (mock) classifier prob, rmse
    clf_prob = float(np.clip(rng.normal(0.86, 0.06), 0.6, 0.98))
    conf = float(np.clip(
        0.30 + 0.35 * (valid_obs / 40) + 0.55 * (break_mag / 0.5)
        + 0.20 * (clf_prob - 0.8) - 0.02 * (rmse - 6),
        0.4, 0.95))

    trajectory = "forest_to_cultivation"
    strip_years = [1967, 1975, 1985, 1995, 2005, 2015, 2023]
    strip = []
    for y in strip_years:
        kind = "corona" if y == 1967 else "landsat" if y < 2016 else "sentinel"
        label = "forest" if y < conv else "cultivated"
        strip.append({"year": y, "label": label, "kind": kind,
                      "available": (y != 1967) or claim.get("area_ha", 1) > 0})

    return {
        "claim_id": claim["claim_id"],
        "conversion_year": conv,
        "break_direction": "loss",
        "trajectory_class": trajectory,
        "confidence": round(conf, 2),
        "confidence_drivers": {
            "valid_observation_years": valid_obs,
            "break_magnitude_ndvi": round(break_mag, 2),
            "classifier_probability": round(clf_prob, 2),
            "corona_registration_rmse_m": rmse,
        },
        "years": years.tolist(),
        "ndvi": [round(v, 3) for v in ndvi.tolist()],
        "evidence_strip": strip,
        "corona_available": True,
        "registration_rmse_m": rmse,
        "_source": "MOCK (replace with spike/01_kaal_gee.py output)",
    }


if __name__ == "__main__":
    import json, sys
    from pathlib import Path
    data = json.loads((Path(__file__).parents[2] / "data" / "demo_district.json").read_text())
    cid = sys.argv[1] if len(sys.argv) > 1 else "FRA-DND-0007"
    claim = next(c for c in data["claims"] if c["claim_id"] == cid)
    print(json.dumps(mock_kaal(claim), indent=2)[:1200])
