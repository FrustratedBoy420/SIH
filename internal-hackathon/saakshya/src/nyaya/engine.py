"""NYAYA — appeal & evidence-matching engine.

Pure-Python, no cloud deps. Given a rejection order + the KAAL/SEEMA evidence
that now exists, decide: is the stated rejection reason ANSWERED? what is the
appeal forum + deadline? Honest about ST vs OTFD limits.
"""
from __future__ import annotations
import json
from datetime import date, timedelta
from pathlib import Path

_RULES = json.loads((Path(__file__).parent / "rules.json").read_text())
CUTOFF = date.fromisoformat(_RULES["fra_cutoff_date"])


def _parse(d: str) -> date:
    return date.fromisoformat(d)


def match_evidence(claim: dict, kaal: dict | None) -> dict:
    """Does existing evidence answer the stated rejection reason?

    claim: a claim dict from demo_district.json (must have rejection_order).
    kaal:  a KAAL result dict (conversion_year, confidence, ...) or None.
    """
    order = claim.get("rejection_order")
    if not order:
        return {"status": "not_rejected", "message": "Claim is not rejected."}

    reason = order["reason_category"]
    taxo = _RULES["reason_taxonomy"].get(reason, {})
    category = claim.get("claimant_category", "ST")

    result = {
        "claim_id": claim["claim_id"],
        "reason_category": reason,
        "reason_label": taxo.get("label", reason),
        "answered_by_evidence": taxo.get("answered_by_evidence"),
        "producing_band": taxo.get("producing_band"),
        "kaal_applicable": taxo.get("kaal_can_help", False),
        "claimant_category": category,
    }

    # Evidence verdict
    if reason == "no_pre_2005_proof" and kaal:
        cy = kaal.get("conversion_year")
        pre_cutoff = cy is not None and cy < CUTOFF.year
        if category == "OTFD":
            # honest limit: satellite cannot reach the ~75-yr / ~1930 bar
            result["verdict"] = "STRENGTHENED_NOT_PROVEN"
            result["finding"] = (
                f"Imagery shows occupation/cultivation since ~{cy}. This STRENGTHENS "
                f"the continuity case but does NOT prove the OTFD 75-year (pre-~1930) "
                f"requirement, which is beyond any satellite record."
            ) if cy else "No conversion detected; imagery does not support the claim window."
        else:  # ST
            if pre_cutoff:
                result["verdict"] = "ANSWERED"
                result["finding"] = (
                    f"Imagery dates conversion to ~{cy}, i.e. occupation predates the "
                    f"13-Dec-2005 cutoff. Supplementary Rule-13 evidence available."
                )
            elif cy:
                result["verdict"] = "CONTRADICTED"
                result["finding"] = (
                    f"Imagery dates conversion to ~{cy}, AFTER the 2005 cutoff. "
                    f"Imagery does NOT support this claim (finding withheld from adverse use)."
                )
            else:
                result["verdict"] = "INCONCLUSIVE"
                result["finding"] = "No reliable breakpoint detected."
    elif reason == "boundary_dispute":
        result["verdict"] = "ROUTE_TO_SEEMA"
        result["finding"] = "Resolve via SEEMA parcel segmentation + PostGIS conflict topology."
    else:
        result["verdict"] = "OUT_OF_IMAGERY_SCOPE"
        result["finding"] = (
            "This rejection reason is not answerable by satellite imagery; "
            "handled by the VAANI/NYAYA document workflow."
        )

    # Appeal routing + deadline
    body = order["rejecting_body"]
    route = _RULES["appeal_routing"].get(body, {})
    result["appeal_forum"] = route.get("forum")
    result["appeal_statute"] = route.get("statute")
    if route.get("deadline_days"):
        deadline = _parse(order["order_date"]) + timedelta(days=route["deadline_days"])
        result["appeal_deadline"] = deadline.isoformat()
        result["window_status"] = "LAPSED" if date.today() > deadline else "OPEN"
    else:
        result["appeal_deadline"] = None
        result["window_status"] = "N/A"

    result["legal_basis"] = _RULES["legal_basis"]
    return result


if __name__ == "__main__":
    import sys
    data = json.loads((Path(__file__).parents[2] / "data" / "demo_district.json").read_text())
    claim = next(c for c in data["claims"] if c["claim_id"] == (sys.argv[1] if len(sys.argv) > 1 else "FRA-DND-0007"))
    from importlib import import_module
    sys.path.insert(0, str(Path(__file__).parents[1]))
    from kaal.mock import mock_kaal
    print(json.dumps(match_evidence(claim, mock_kaal(claim)), indent=2))
