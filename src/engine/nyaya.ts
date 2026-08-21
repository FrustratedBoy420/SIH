import type { Claim, KaalResult, NyayaResult, ReasonCategory, Verdict } from "./types";
import { CUTOFF } from "./kaal";

/* NYAYA — rejection-reason → evidence match, and appeal routing.
   Ported from src/nyaya/engine.py. Rules are a flat table on purpose:
   an FRA amendment should be a config edit, not a code change. */

export const REASONS: Record<ReasonCategory, { label: string; short: string; answeredBy: string; band: string }> = {
  no_pre_2005_proof: {
    label: "No documentary proof of occupation before 13 Dec 2005",
    short: "No pre-2005 proof",
    answeredBy: "Dated land-use transition from the satellite archive, with a decade frame strip",
    band: "KAAL",
  },
  boundary_dispute: {
    label: "Boundary or overlap dispute",
    short: "Boundary dispute",
    answeredBy: "Segmented parcel boundary and topological conflict map",
    band: "SEEMA",
  },
  gram_sabha_procedure: {
    label: "Gram Sabha procedural defect",
    short: "Procedural defect",
    answeredBy: "Corrected resolution and a re-filing checklist",
    band: "VAANI workflow",
  },
  non_st_otfd: {
    label: "Eligibility contested — not ST / OTFD",
    short: "Eligibility contested",
    answeredBy: "Community and revenue records — outside the imagery scope",
    band: "External",
  },
  incomplete_form: {
    label: "Incomplete or defective claim form",
    short: "Defective form",
    answeredBy: "Field-completeness check and re-submission",
    band: "VAANI",
  },
};

const ROUTE = {
  GS: { forum: "Sub-Divisional Level Committee", short: "SDLC", statute: "FRA s.6(2)", days: 60 },
  SDLC: { forum: "District Level Committee", short: "DLC", statute: "FRA s.6(4)", days: 60 },
  DLC: { forum: "State review / writ jurisdiction", short: "HC", statute: "beyond DLC", days: null as number | null },
};

export const RULE_13 =
  "Rule 13, Forest Rights Rules (as amended 06-09-2012) lists satellite imagery among admissible evidences. It may supplement other evidence; it does not replace it. Rule 12A(11) bars SDLC/DLC from insisting on any single form of evidence.";

export const VERDICT_UI: Record<Verdict, { tone: "ok" | "warn" | "bad" | "mute"; label: string }> = {
  ANSWERED: { tone: "ok", label: "Rejection reason answered" },
  STRENGTHENED_NOT_PROVEN: { tone: "warn", label: "Continuity strengthened, not proven" },
  CONTRADICTED: { tone: "bad", label: "Archive does not corroborate" },
  ROUTE_TO_SEEMA: { tone: "warn", label: "Routed to boundary analysis" },
  OUT_OF_IMAGERY_SCOPE: { tone: "mute", label: "Outside imagery scope" },
  NOT_REJECTED: { tone: "mute", label: "Not a rejected claim" },
};

export const TODAY = new Date("2026-08-21T00:00:00Z");

export function runNyaya(claim: Claim, kaal: KaalResult | null): NyayaResult | null {
  const o = claim.rejection_order;
  if (!o) return null;
  const meta = REASONS[o.reason_category];
  const cat = claim.claimant_category;
  const cy = kaal?.conversion_year ?? null;

  let verdict: Verdict = "OUT_OF_IMAGERY_SCOPE";
  let finding = "This rejection reason is not answerable from imagery. It moves through the document workflow.";
  let nextAction = "Compile the corrected record and re-file with the Gram Sabha.";

  if (o.reason_category === "no_pre_2005_proof" && kaal && cy !== null) {
    if (cat === "OTFD") {
      verdict = "STRENGTHENED_NOT_PROVEN";
      finding = `The archive shows cultivation on this parcel from about ${cy}. That strengthens the record of continuous occupation, but it cannot reach the seventy-five-year OTFD threshold — no satellite record goes back that far.`;
      nextAction = "File the imagery as supporting evidence alongside genealogical and revenue records covering the pre-1950 period.";
    } else if (cy < CUTOFF) {
      verdict = "ANSWERED";
      finding = `The archive dates the transition from canopy to cultivation to about ${cy} — ${CUTOFF - cy} years before the 13 December 2005 cutoff. This is admissible supplementary evidence under Rule 13.`;
      nextAction = `File the evidence dossier with the ${ROUTE[o.rejecting_body].short === "SDLC" ? "Sub-Divisional" : "District"} Level Committee, together with the Gram Sabha resolution and one oral testimony.`;
    } else {
      verdict = "CONTRADICTED";
      finding = `The archive dates the transition to about ${cy}, after the cutoff. Under the dual-use rule this finding is held back and is not rendered into any claimant-facing artefact.`;
      nextAction = "Withheld. Route to human review — imagery must never be used to build a case against a claimant.";
    }
  } else if (o.reason_category === "boundary_dispute") {
    verdict = "ROUTE_TO_SEEMA";
    finding = "Present-day segmentation resolves the parcel edge and measures the overlap area against the adjoining claim and the notified compartment boundary.";
    nextAction = "Attach the conflict topology map and request a joint demarcation before the committee.";
  }

  const rt = ROUTE[o.rejecting_body];
  let deadline: string | null = null;
  let daysLeft: number | null = null;
  let win: NyayaResult["window"] = "N/A";
  if (rt.days) {
    const d = new Date(o.order_date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + rt.days);
    deadline = d.toISOString().slice(0, 10);
    daysLeft = Math.round((d.getTime() - TODAY.getTime()) / 86400000);
    win = daysLeft < 0 ? "LAPSED" : "OPEN";
  }
  if (win === "LAPSED") {
    nextAction =
      "The sixty-day window has closed. Seek condonation of delay with the dossier attached, or advise a fresh claim under s.6(1).";
  }

  return {
    claim_id: claim.claim_id,
    reason: o.reason_category,
    reasonLabel: meta.label,
    answeredBy: meta.answeredBy,
    band: meta.band,
    verdict,
    finding,
    forum: rt.forum,
    statute: rt.statute,
    deadline,
    daysLeft,
    window: win,
    nextAction,
  };
}
