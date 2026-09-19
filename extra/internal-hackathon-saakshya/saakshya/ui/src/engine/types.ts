export type ClaimType = "IFR" | "CR" | "CFR";
export type ClaimStatus = "granted" | "pending" | "rejected";
export type Category = "ST" | "OTFD";
export type ReasonCategory =
  | "no_pre_2005_proof"
  | "boundary_dispute"
  | "gram_sabha_procedure"
  | "non_st_otfd"
  | "incomplete_form";

export interface RejectionOrder {
  order_date: string;
  rejecting_body: "GS" | "SDLC" | "DLC";
  reason_category: ReasonCategory;
  raw_text: string;
  ocr_confidence: number;
}

export interface Village {
  lgd_code: string;
  name: string;
  sc_pct: number;
  st_pct: number;
  water_index: number;
  irrigation: number;
  cultivable_area_ha: number;
  road_connectivity: number;
  dajgua_target: boolean;
}

export interface Claim {
  claim_id: string;
  village_lgd: string;
  claimant_name: string;
  claim_type: ClaimType;
  claimant_category: Category;
  status: ClaimStatus;
  filed_date: string;
  geometry_centroid: [number, number];
  area_ha: number;
  rejection_order?: RejectionOrder;
  conflict_with?: string;
}

/** One frame of the Chronoscope film strip. */
export interface Frame {
  year: number;
  sensor: "corona" | "mss" | "tm" | "etm" | "oli" | "s2";
  /** fraction of the parcel under canopy in that year, 0..1 */
  canopy: number;
  /** valid cloud-free observations feeding the composite */
  obs: number;
}

export interface KaalResult {
  claim_id: string;
  conversion_year: number;
  break_direction: "loss" | "gain" | "none";
  trajectory_class: "forest_to_cultivation" | "forest_to_settlement" | "shifting_cultivation" | "stable_forest";
  confidence: number;
  confidence_drivers: {
    valid_observation_years: number;
    break_magnitude_ndvi: number;
    classifier_probability: number;
    corona_registration_rmse_m: number;
  };
  years: number[];
  ndvi: number[];
  frames: Frame[];
  corona_available: boolean;
  seed: number;
  source: "MOCK";
}

export type Verdict =
  | "ANSWERED"
  | "STRENGTHENED_NOT_PROVEN"
  | "CONTRADICTED"
  | "ROUTE_TO_SEEMA"
  | "OUT_OF_IMAGERY_SCOPE"
  | "NOT_REJECTED";

export interface NyayaResult {
  claim_id: string;
  reason: ReasonCategory;
  reasonLabel: string;
  answeredBy: string;
  band: string;
  verdict: Verdict;
  finding: string;
  forum: string;
  statute: string;
  deadline: string | null;
  daysLeft: number | null;
  window: "OPEN" | "LAPSED" | "N/A";
  nextAction: string;
}

export interface SchemeRec {
  code: string;
  name: string;
  eligible: boolean;
  because: string[];
}

export interface VillageProfile extends Village {
  claims: number;
  granted: number;
  pending: number;
  rejected: number;
  recoverable: number;
  landcover: { forest: number; agriculture: number; water: number; settlement: number };
  gaps: { water: number; infrastructure: number; agriPotential: number; fraCoverage: number; schemeFit: number };
  priority: number;
  priorityBand: "critical" | "high" | "moderate";
  interventions: { rank: number; label: string; why: string[]; schemes: string[] }[];
  center: [number, number];
}
