import type { Claim, Frame, KaalResult } from "./types";

/* KAAL — historic evidence engine.
   Deterministic stand-in for the Earth Engine pipeline in spike/01_kaal_gee.py.
   Emits exactly the schema the real LandTrendr run emits, so swapping the
   source is a one-function change. Everything here is seeded off claim_id,
   so a claim looks identical on every reload and in every recording. */

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CUTOFF = 2005;
export const ARCHIVE_START = 1967;
export const ARCHIVE_END = 2025;

export function sensorFor(year: number): Frame["sensor"] {
  if (year <= 1971) return "corona";
  if (year < 1984) return "mss";
  if (year < 1999) return "tm";
  if (year < 2013) return "etm";
  if (year < 2017) return "oli";
  return "s2";
}

export const SENSOR_LABEL: Record<Frame["sensor"], string> = {
  corona: "CORONA KH-4B",
  mss: "LANDSAT 1–3 MSS",
  tm: "LANDSAT 5 TM",
  etm: "LANDSAT 7 ETM+",
  oli: "LANDSAT 8 OLI",
  s2: "SENTINEL-2 MSI",
};
export const SENSOR_RES: Record<Frame["sensor"], string> = {
  corona: "1.8 m · film",
  mss: "60 m",
  tm: "30 m",
  etm: "30 m",
  oli: "30 m",
  s2: "10 m",
};

/** Years the archive actually holds a usable frame for. Corona is sparse. */
export function archiveYears(): number[] {
  const out = [1967, 1971];
  for (let y = 1972; y <= ARCHIVE_END; y++) out.push(y);
  return out;
}

export function runKaal(claim: Claim): KaalResult {
  const seed = hash(claim.claim_id);
  const r = rng(seed);
  const ri = (a: number, b: number) => Math.floor(r() * (b - a)) + a;
  const reason = claim.rejection_order?.reason_category;

  let trajectory: KaalResult["trajectory_class"] = "forest_to_cultivation";
  let conv: number;
  if (reason === "no_pre_2005_proof") conv = ri(1986, 2003);
  else if (reason === "boundary_dispute") conv = ri(1990, 2009);
  else if (claim.status === "granted") conv = ri(1978, 1999);
  else conv = ri(1984, 2014);

  // A tenth of parcels are podu/jhum — cyclical, and a positive occupation
  // signal, not noise. They read completely differently on the strip.
  if (r() < 0.14) trajectory = "shifting_cultivation";
  else if (claim.claim_type === "IFR" && r() < 0.22) trajectory = "forest_to_settlement";

  const transition = 2 + Math.floor(r() * 3); // years the clearing takes
  const preCanopy = 0.87 + r() * 0.08;
  const postCanopy = trajectory === "forest_to_settlement" ? 0.12 + r() * 0.08 : 0.28 + r() * 0.12;

  const years: number[] = [];
  const ndvi: number[] = [];
  const frames: Frame[] = [];

  for (const y of archiveYears()) {
    let canopy: number;
    if (trajectory === "shifting_cultivation" && y >= conv) {
      // 6–8 year fallow cycle: cleared, cropped, regrown, cleared again
      const phase = ((y - conv) % 7) / 7;
      canopy = postCanopy + (preCanopy - postCanopy) * Math.pow(Math.max(0, phase - 0.15) / 0.85, 1.4);
    } else if (y < conv) {
      canopy = preCanopy;
    } else if (y < conv + transition) {
      const t = (y - conv + 1) / transition;
      canopy = preCanopy + (postCanopy - preCanopy) * t;
    } else {
      canopy = postCanopy;
    }
    canopy = Math.max(0.04, Math.min(0.97, canopy + (r() - 0.5) * 0.055));

    const sensor = sensorFor(y);
    const obs = sensor === "corona" ? 1 : sensor === "mss" ? ri(3, 9) : sensor === "s2" ? ri(24, 46) : ri(9, 22);

    // NDVI tracks canopy but is not canopy — cropped fields green up too.
    const crop = y >= conv && trajectory !== "forest_to_settlement" ? 0.1 + r() * 0.06 : 0;
    years.push(y);
    ndvi.push(+Math.max(0.05, Math.min(0.95, canopy * 0.82 + 0.08 + crop)).toFixed(3));
    frames.push({ year: y, sensor, canopy: +canopy.toFixed(3), obs });
  }

  const breakMag = +(preCanopy - postCanopy).toFixed(3);
  const validObs = frames.filter((f) => f.year >= conv - 5 && f.year <= conv + 5).reduce((a, f) => a + (f.obs > 2 ? 1 : 0), 0);
  const rmse = +(5.5 + r() * 9).toFixed(1);
  const clf = Math.min(0.98, Math.max(0.61, 0.87 + (r() - 0.5) * 0.14));

  const confidence = +Math.min(
    0.96,
    Math.max(
      0.38,
      0.22 + 0.3 * (validObs / 11) + 0.42 * (breakMag / 0.75) + 0.22 * (clf - 0.75) - 0.012 * (rmse - 5.5),
    ),
  ).toFixed(2);

  return {
    claim_id: claim.claim_id,
    conversion_year: conv,
    break_direction: "loss",
    trajectory_class: trajectory,
    confidence,
    confidence_drivers: {
      valid_observation_years: validObs,
      break_magnitude_ndvi: breakMag,
      classifier_probability: +clf.toFixed(2),
      corona_registration_rmse_m: rmse,
    },
    years,
    ndvi,
    frames,
    corona_available: true,
    seed,
    source: "MOCK",
  };
}

export const TRAJECTORY_LABEL: Record<KaalResult["trajectory_class"], string> = {
  forest_to_cultivation: "Forest → settled cultivation",
  forest_to_settlement: "Forest → homestead / settlement",
  shifting_cultivation: "Podu / jhum — cyclical traditional cultivation",
  stable_forest: "Stable canopy — no conversion detected",
};
