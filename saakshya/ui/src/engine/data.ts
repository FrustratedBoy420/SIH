import raw from "../data/demo_district.json";
import type { Claim, ClaimStatus, ClaimType, Category, ReasonCategory, Village, VillageProfile } from "./types";
import { hash, rng, runKaal } from "./kaal";
import { runNyaya } from "./nyaya";
import { interventions, priorityScore, schemesFor } from "./setu";

export const DISTRICT = raw.district as { name: string; state: string; note: string; center: [number, number] };
export const VILLAGES = raw.villages as Village[];
const CURATED = raw.claims as unknown as Claim[];

/* ── geometry ───────────────────────────────────────────────────────────
   The source records carry a centroid and an area. Real parcel boundaries
   for FRA claims are not published, so we draw an irregular parcel of the
   recorded area around each centroid — deterministic per claim id, and
   labelled illustrative everywhere it is rendered. */
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((22.94 * Math.PI) / 180);

export function parcelRing(claim: Claim): [number, number][] {
  const r = rng(hash(claim.claim_id + "geom"));
  const radius = Math.sqrt((claim.area_ha * 10000) / Math.PI);
  const n = 7 + Math.floor(r() * 4);
  const rot = r() * Math.PI * 2;
  const squash = 0.65 + r() * 0.6;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const rr = radius * (0.74 + r() * 0.55);
    const dx = Math.cos(a) * rr * squash;
    const dy = Math.sin(a) * rr;
    pts.push([claim.geometry_centroid[1] + dx / M_PER_DEG_LON, claim.geometry_centroid[0] + dy / M_PER_DEG_LAT]);
  }
  pts.push(pts[0]);
  return pts;
}

function blob(center: [number, number], radiusDeg: number, seed: number, n = 22): [number, number][] {
  const r = rng(seed);
  const offs = Array.from({ length: n }, () => 0.8 + r() * 0.45);
  // smooth the radii so the outline reads as terrain, not as noise
  const sm = offs.map((_, i) => (offs[(i - 1 + n) % n] + offs[i] * 2 + offs[(i + 1) % n]) / 4);
  const pts: [number, number][] = sm.map((k, i) => {
    const a = (i / n) * Math.PI * 2;
    return [center[1] + (Math.cos(a) * radiusDeg * k) / 0.92, center[0] + Math.sin(a) * radiusDeg * k];
  });
  pts.push(pts[0]);
  return pts;
}

/* ── village geography ─────────────────────────────────────────────── */
export const VILLAGE_CENTER: Record<string, [number, number]> = {};
for (const v of VILLAGES) {
  const own = CURATED.filter((c) => c.village_lgd === v.lgd_code);
  const lat = own.reduce((a, c) => a + c.geometry_centroid[0], 0) / own.length;
  const lon = own.reduce((a, c) => a + c.geometry_centroid[1], 0) / own.length;
  VILLAGE_CENTER[v.lgd_code] = [+lat.toFixed(4), +lon.toFixed(4)];
}
export const VILLAGE_RING: Record<string, [number, number][]> = {};
for (const v of VILLAGES) VILLAGE_RING[v.lgd_code] = blob(VILLAGE_CENTER[v.lgd_code], 0.036, hash(v.lgd_code));

/* ── the rest of the block ──────────────────────────────────────────────
   Six villages hold 44 curated records. A district atlas needs the whole
   block to read as a block, so the remaining claims are generated from the
   same distributions and flagged `generated` — the UI says so on screen. */
const REJ_TEXT: Record<ReasonCategory, string> = {
  no_pre_2005_proof:
    "Claim rejected. Claimant failed to produce documentary evidence of occupation prior to 13.12.2005.",
  boundary_dispute:
    "Claim contested. Portion overlaps an adjoining claim / falls within notified forest compartment boundary.",
  gram_sabha_procedure:
    "Claim returned. Gram Sabha resolution not accompanied by the quorum register as required under Rule 4(1)(e).",
  non_st_otfd:
    "Claim rejected. Claimant not established as Scheduled Tribe or as Other Traditional Forest Dweller under s.2(o).",
  incomplete_form: "Claim rejected. Form-A incomplete; khasra particulars and sketch map not annexed.",
};

function generateClaims(): Claim[] {
  const out: Claim[] = [];
  let n = 200;
  for (const v of VILLAGES) {
    const r = rng(hash(v.lgd_code + "fill"));
    const center = VILLAGE_CENTER[v.lgd_code];
    const count = 20 + Math.floor(r() * 10);
    for (let i = 0; i < count; i++) {
      const id = `FRA-DND-0${n++}`;
      const roll = r();
      const status: ClaimStatus = roll < 0.34 ? "rejected" : roll < 0.63 ? "pending" : "granted";
      const t = r();
      const claim_type: ClaimType = t < 0.66 ? "IFR" : t < 0.86 ? "CR" : "CFR";
      const cat: Category = r() < 0.79 ? "ST" : "OTFD";
      const a = (r() - 0.5) * 2 * Math.PI;
      const rad = Math.sqrt(r()) * 0.031;
      const lat = +(center[0] + Math.sin(a) * rad).toFixed(4);
      const lon = +(center[1] + (Math.cos(a) * rad) / 0.92).toFixed(4);
      const area = claim_type === "IFR" ? +(0.8 + r() * 3.6).toFixed(1) : +(5 + r() * 20).toFixed(1);
      const c: Claim = {
        claim_id: id,
        village_lgd: v.lgd_code,
        claimant_name: "[synthetic]",
        claim_type,
        claimant_category: cat,
        status,
        filed_date: `20${13 + Math.floor(r() * 7)}-0${1 + Math.floor(r() * 8)}-1${Math.floor(r() * 9)}`,
        geometry_centroid: [lat, lon],
        area_ha: area,
      };
      if (status === "rejected") {
        const rr = r();
        const reason: ReasonCategory =
          cat === "OTFD" && rr < 0.2
            ? "non_st_otfd"
            : rr < 0.52
              ? "no_pre_2005_proof"
              : rr < 0.72
                ? "boundary_dispute"
                : rr < 0.87
                  ? "incomplete_form"
                  : "gram_sabha_procedure";
        const body = r() < 0.62 ? "SDLC" : r() < 0.85 ? "GS" : "DLC";
        c.rejection_order = {
          order_date: `20${18 + Math.floor(r() * 7)}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 27)).padStart(2, "0")}`,
          rejecting_body: body as "GS" | "SDLC" | "DLC",
          reason_category: reason,
          raw_text: REJ_TEXT[reason],
          ocr_confidence: +(0.71 + r() * 0.27).toFixed(2),
        };
      }
      out.push(c);
    }
  }
  return out;
}

export const CLAIMS: Claim[] = [...CURATED, ...generateClaims()];
export const CURATED_IDS = new Set(CURATED.map((c) => c.claim_id));
export const claimById = new Map(CLAIMS.map((c) => [c.claim_id, c]));
export const villageByCode = new Map(VILLAGES.map((v) => [v.lgd_code, v]));
export const villageName = (code: string) => villageByCode.get(code)?.name ?? code;

/* ── memoised engine output ─────────────────────────────────────────── */
const kaalCache = new Map<string, ReturnType<typeof runKaal>>();
export function kaalFor(id: string) {
  if (!kaalCache.has(id)) kaalCache.set(id, runKaal(claimById.get(id)!));
  return kaalCache.get(id)!;
}
export function nyayaFor(id: string) {
  const c = claimById.get(id)!;
  return runNyaya(c, c.rejection_order ? kaalFor(id) : null);
}

/** A rejected claim is recoverable when the archive answers the stated reason. */
export function isRecoverable(id: string) {
  const n = nyayaFor(id);
  return n?.verdict === "ANSWERED" || n?.verdict === "ROUTE_TO_SEEMA";
}
/** Evidence strength drives the choropleth and the officer queue ranking. */
export function evidenceStrength(id: string) {
  const c = claimById.get(id)!;
  if (!c.rejection_order) return kaalFor(id).confidence * 0.6;
  const n = nyayaFor(id)!;
  const k = kaalFor(id);
  const base = k.confidence;
  if (n.verdict === "ANSWERED") return Math.min(0.99, base * 1.06);
  if (n.verdict === "ROUTE_TO_SEEMA") return base * 0.82;
  if (n.verdict === "STRENGTHENED_NOT_PROVEN") return base * 0.6;
  if (n.verdict === "CONTRADICTED") return base * 0.28;
  return base * 0.34;
}

/* ── conflicts (SEEMA topology) ─────────────────────────────────────── */
export interface Conflict { a: string; b: string; overlap_ha: number; kind: "claim-claim" | "claim-forest"; }
export const CONFLICTS: Conflict[] = (() => {
  const out: Conflict[] = [];
  const disputed = CLAIMS.filter((c) => c.rejection_order?.reason_category === "boundary_dispute");
  for (const c of disputed) {
    const r = rng(hash(c.claim_id + "conf"));
    const near = CLAIMS.filter(
      (o) =>
        o.claim_id !== c.claim_id &&
        o.village_lgd === c.village_lgd &&
        Math.hypot(o.geometry_centroid[0] - c.geometry_centroid[0], o.geometry_centroid[1] - c.geometry_centroid[1]) < 0.014,
    );
    if (!near.length) continue;
    const partner = near[Math.floor(r() * near.length)];
    out.push({
      a: c.claim_id,
      b: partner.claim_id,
      overlap_ha: +(Math.min(c.area_ha, partner.area_ha) * (0.12 + r() * 0.35)).toFixed(2),
      kind: r() < 0.7 ? "claim-claim" : "claim-forest",
    });
  }
  return out;
})();
export const conflictFor = (id: string) => CONFLICTS.find((c) => c.a === id || c.b === id);

/* ── village profiles ───────────────────────────────────────────────── */
export const PROFILES: VillageProfile[] = VILLAGES.map((v) => {
  const own = CLAIMS.filter((c) => c.village_lgd === v.lgd_code);
  const rejected = own.filter((c) => c.status === "rejected");
  const r = rng(hash(v.lgd_code + "cover"));
  const agri = Math.round(18 + v.irrigation * 40 + r() * 8);
  const water = Math.round(1 + v.water_index * 7);
  const settlement = Math.round(3 + r() * 4);
  const p: VillageProfile = {
    ...v,
    claims: own.length,
    granted: own.filter((c) => c.status === "granted").length,
    pending: own.filter((c) => c.status === "pending").length,
    rejected: rejected.length,
    recoverable: rejected.filter((c) => isRecoverable(c.claim_id)).length,
    landcover: { agriculture: agri, water, settlement, forest: 100 - agri - water - settlement },
    gaps: {
      water: +(1 - v.water_index).toFixed(2),
      infrastructure: +(1 - v.road_connectivity).toFixed(2),
      agriPotential: +Math.min(1, (v.cultivable_area_ha / 600) * (1 - v.irrigation) * 1.6).toFixed(2),
      fraCoverage: +(1 - own.filter((c) => c.status === "granted").length / Math.max(1, own.length)).toFixed(2),
      schemeFit: v.dajgua_target ? 0.9 : 0.45,
    },
    priority: 0,
    priorityBand: "moderate",
    interventions: [],
    center: VILLAGE_CENTER[v.lgd_code],
  };
  p.priority = priorityScore(p.gaps);
  p.priorityBand = p.priority >= 0.68 ? "critical" : p.priority >= 0.55 ? "high" : "moderate";
  p.interventions = interventions(p);
  return p;
}).sort((a, b) => b.priority - a.priority);

export const profileFor = (code: string) => PROFILES.find((p) => p.lgd_code === code)!;
export const schemesForVillage = (code: string) => schemesFor(profileFor(code));

/* ── district roll-up ───────────────────────────────────────────────── */
export const DISTRICT_STATS = (() => {
  const rejected = CLAIMS.filter((c) => c.status === "rejected");
  const recoverable = rejected.filter((c) => isRecoverable(c.claim_id));
  const lapsed = rejected.filter((c) => nyayaFor(c.claim_id)?.window === "LAPSED");
  return {
    total: CLAIMS.length,
    granted: CLAIMS.filter((c) => c.status === "granted").length,
    pending: CLAIMS.filter((c) => c.status === "pending").length,
    rejected: rejected.length,
    recoverable: recoverable.length,
    lapsed: lapsed.length,
    conflicts: CONFLICTS.length,
    hectares: +CLAIMS.reduce((a, c) => a + c.area_ha, 0).toFixed(0),
    recoverableHa: +recoverable.reduce((a, c) => a + c.area_ha, 0).toFixed(0),
  };
})();

export const FEATURED = "FRA-DND-0007";
