"""The five gates (PRD 10.14).

The product's central claim is that it knows what it cannot establish. That
claim is only credible if the refusals are implemented, reachable and
demonstrated -- so each gate below halts or degrades the run, states its reason
in the log and in the dossier, and is worth showing deliberately in a demo.

A halt is a successful outcome, not a failure.
"""

from __future__ import annotations

import math

CONFIDENCE_MIN = 0.50
R95_MAX_KM = 36.0
MARGIN_MIN = 0.10


def gate(gid, name, fired, detail, halts=False):
    return dict(id=gid, name=name, fired=bool(fired), halts=bool(halts and fired), detail=detail)


def gate5_archive(archive_span_h, horizon_h):
    ok = archive_span_h >= horizon_h
    return gate(5, "archive_coverage", not ok,
                f"AIS archive spans {archive_span_h:.1f} h against a {horizon_h:.1f} h drift "
                f"horizon" + ("" if ok else " -- refusing to start, a partial archive silently "
                                            "truncates the candidate set"),
                halts=True)


def gate1_confidence(confidence, n_candidates):
    fired = (confidence is None) or (confidence < CONFIDENCE_MIN)
    if confidence is None:
        detail = (f"{n_candidates} dark candidates, none retained -- a dark feature was found "
                  f"and we do not believe it is oil")
    else:
        detail = (f"detection confidence {confidence:.2f} "
                  f"{'<' if fired else '>='} {CONFIDENCE_MIN:.2f}")
    return gate(1, "detection_confidence", fired, detail, halts=True)


def gate2_region(r95_km):
    fired = r95_km > R95_MAX_KM
    return gate(2, "origin_region_size", fired,
                f"95 % containment radius {r95_km:.1f} km "
                f"{'>' if fired else '<='} {R95_MAX_KM:.0f} km"
                + (" -- dropping the spatial filter and reporting attribution as unavailable, "
                   "rather than shrinking the region to look decisive" if fired else ""),
                halts=True)


def gate3_dark_channel(available, reason=""):
    return gate(3, "dark_channel_availability", not available,
                "dark channel available" if available
                else f"dark channel unavailable: {reason}. Result is single-channel.",
                halts=False)


def gate4_margin(margin):
    fired = (margin is None) or (isinstance(margin, float) and math.isnan(margin)) or margin < MARGIN_MIN
    if margin is None or (isinstance(margin, float) and math.isnan(margin)):
        detail = "fewer than two candidates -- no leader margin to report"
    else:
        detail = (f"leader margin {margin:.3f} "
                  f"{'<' if fired else '>='} {MARGIN_MIN:.2f}"
                  + (" -- the evidence does not separate the candidates, naming neither"
                     if fired else ""))
    return gate(4, "leader_margin", fired, detail, halts=False)
