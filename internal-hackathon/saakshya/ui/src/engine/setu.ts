import type { SchemeRec, VillageProfile } from "./types";

/* SETU — scheme convergence. Rules stay declarative and rule-based on purpose:
   no model decides eligibility. A model may only phrase the explanation. */

export const WEIGHTS = [
  { key: "water", w: 0.3, label: "Water gap" },
  { key: "infrastructure", w: 0.25, label: "Infrastructure gap" },
  { key: "agriPotential", w: 0.2, label: "Agricultural potential" },
  { key: "fraCoverage", w: 0.15, label: "FRA beneficiary coverage" },
  { key: "schemeFit", w: 0.1, label: "Scheme eligibility" },
] as const;

export function priorityScore(g: VillageProfile["gaps"]): number {
  return +WEIGHTS.reduce((a, x) => a + x.w * g[x.key as keyof typeof g], 0).toFixed(3);
}

export function schemesFor(v: VillageProfile): SchemeRec[] {
  const out: SchemeRec[] = [];
  out.push({
    code: "JJM",
    name: "Jal Jeevan Mission",
    eligible: v.water_index < 0.45,
    because: [
      `Water-access index ${v.water_index.toFixed(2)} — below the 0.45 threshold`,
      `${v.landcover.agriculture}% of village land under cultivation`,
      v.gaps.water > 0.55 ? "No perennial surface water mapped within 1.5 km" : "Limited surface water nearby",
    ],
  });
  out.push({
    code: "MGNREGA",
    name: "MGNREGA — land development on FRA titles",
    eligible: v.granted > 0,
    because: [
      `${v.granted} recognised title-holders in the village`,
      "Land-development works are permissible on recognised FRA land",
      v.irrigation < 0.35 ? `Irrigation coverage ${(v.irrigation * 100) | 0}% — bunding and farm-pond works indicated` : "Supplementary works indicated",
    ],
  });
  out.push({
    code: "PMKISAN",
    name: "PM-KISAN",
    eligible: v.granted > 0 && v.cultivable_area_ha > 0,
    because: [
      `${v.cultivable_area_ha} ha cultivable area recorded`,
      "Income support follows recognition of the title",
    ],
  });
  out.push({
    code: "DAJGUA",
    name: "Dharti Aaba Janjatiya Gram Utkarsh Abhiyan",
    eligible: v.dajgua_target,
    because: [
      v.dajgua_target ? "Village is on the DAJGUA target list" : "Village is not on the DAJGUA target list",
      `Scheduled Tribe population ${v.st_pct}%`,
    ],
  });
  out.push({
    code: "PMGSY",
    name: "PMGSY — rural connectivity",
    eligible: v.road_connectivity < 0.5,
    because: [`Road connectivity index ${v.road_connectivity.toFixed(2)}`, "Habitation is off the all-weather network"],
  });
  return out;
}

export function interventions(v: VillageProfile) {
  const cands = [
    {
      label: "Water infrastructure",
      score: v.gaps.water,
      why: [
        `Water-access index ${v.water_index.toFixed(2)}`,
        `Irrigation coverage ${(v.irrigation * 100) | 0}%`,
        `${v.landcover.water}% of village area is surface water`,
        `${v.granted + v.rejected} FRA households dependent on rain-fed plots`,
      ],
      schemes: ["Jal Jeevan Mission", "MGNREGA farm ponds", "DAJGUA"],
    },
    {
      label: "Land development",
      score: v.gaps.agriPotential,
      why: [
        `${v.cultivable_area_ha} ha cultivable, ${(v.irrigation * 100) | 0}% irrigated`,
        `${v.granted} recognised titles eligible for works`,
        "Bunding and levelling indicated on recently converted parcels",
      ],
      schemes: ["MGNREGA", "PM-KISAN", "RKVY"],
    },
    {
      label: "Road connectivity",
      score: v.gaps.infrastructure,
      why: [
        `Road connectivity index ${v.road_connectivity.toFixed(2)}`,
        "Nearest all-weather road beyond the habitation cluster",
        "Blocks market access for cultivated output",
      ],
      schemes: ["PMGSY", "DAJGUA"],
    },
    {
      label: "Claim recovery drive",
      score: v.rejected > 0 ? Math.min(1, v.recoverable / Math.max(1, v.rejected)) : 0,
      why: [
        `${v.rejected} rejected claims in the village`,
        `${v.recoverable} carry pre-2005 archive evidence`,
        "Appeal windows are closing across the block",
      ],
      schemes: ["FRA s.6(2) appeal", "DAJGUA facilitation"],
    },
  ];
  return cands
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((c, i) => ({ rank: i + 1, label: c.label, why: c.why, schemes: c.schemes }));
}
