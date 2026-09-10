import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Eyebrow } from "../components/Instruments";
import { IconArrow } from "../components/Icons";
import { RULE_13 } from "../engine/nyaya";

const PIPELINE = [
  { n: "Acquire", body: "Annual dry-season composites from Landsat MSS, TM, ETM+ and OLI and from Sentinel-2, pulled through Google Earth Engine. Corona KH-4B film for the pre-1972 sheet, georeferenced by hand against a Survey of India toposheet, with the RMSE recorded.", tech: "Earth Engine · STAC · rasterio" },
  { n: "Index", body: "NDVI, NBR and tasselled-cap wetness per parcel per year. The count of cloud-free observations behind each year is kept and surfaced — thin years are flagged, never quietly interpolated.", tech: "xarray" },
  { n: "Segment", body: "LandTrendr over the full stack to find the breakpoint year. The published CCDC product covers 1999 to 2019 only, so anything earlier is a run of our own — that is the whole point of the exercise.", tech: "LandTrendr · CCDC" },
  { n: "Classify", body: "Break direction and post-break trajectory: settled cultivation, homestead, or podu and jhum. Cyclical clearing is modelled as a positive traditional-occupation class, not as noise to be filtered out.", tech: "PyTorch" },
  { n: "Match", body: "The ground recorded on the rejection order, read by OCR and classified, is put against the finding. The output states what is held, what is missing, and which forum can hear it.", tech: "PaddleOCR · IndicNER · JSON rules" },
  { n: "Emit", body: "One claim polygon in, one dossier out: the finding, its confidence and drivers, the decade frame strip, the Rule 13 citation, the appeal window, and two blank slots the village must fill.", tech: "ReportLab" },
];

const REAL = [
  ["Interface, routing, atlas, every screen", "Built and working", "ok"],
  ["MapLibre WebGIS, claim layers, conflict topology", "Built and working", "ok"],
  ["Breakpoint dating, confidence model, ST/OTFD rules", "Real logic, running on synthetic input", "warn"],
  ["Appeal routing and scheme convergence", "Computed from the data on screen", "ok"],
  ["Archive frames", "Procedurally reconstructed, mirroring the real pipeline's output", "warn"],
  ["LandTrendr over real Landsat scenes", "Designed, not wired — needs Earth Engine credentials", "bad"],
  ["Claim records and rejection orders", "Synthetic, labelled throughout", "warn"],
] as const;

const GLOSSARY: [string, string][] = [
  ["FRA", "The Scheduled Tribes and Other Traditional Forest Dwellers (Recognition of Forest Rights) Act, 2006."],
  ["IFR / CR / CFR", "Individual forest right, community right, and community forest resource right — the three things a claim can be for."],
  ["Patta", "The title deed issued when a claim is recognised."],
  ["Gram Sabha", "The village assembly. It verifies claims first, and its resolution is evidence in its own right."],
  ["SDLC / DLC", "Sub-divisional and district level committees — the approval and appeal levels."],
  ["The cutoff", "13 December 2005. Occupation must predate it."],
  ["Breakpoint", "The year the archive detects the land changed from canopy to something else."],
  ["NDVI", "A greenness index computed from red and near-infrared reflectance. High under canopy, lower over worked ground."],
  ["False colour 4-3-2", "The band combination used throughout this interface. Vegetation prints red, bare and worked soil prints cyan, water prints near-black."],
  ["Rule 13", "The rule listing what counts as evidence for a claim. Satellite imagery is on the list, as a supplement."],
];

const TONE = { ok: "#4FA86B", warn: "#D9A441", bad: "#8B9AA3" };

export default function Method() {
  return (
    <Shell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-6 pt-8 pb-24 lg:px-10">
          <Eyebrow>Method</Eyebrow>
          <h1 className="display-xl mt-3 max-w-[18ch] text-[clamp(38px,5vw,74px)] text-halide">
            How a refusal becomes a filing.
          </h1>
          <p className="mt-6 max-w-[64ch] text-[15px] leading-[1.7] text-dim">
            Six steps, one district, no manual intervention beyond a single georeference. Everything the
            platform asserts carries its confidence, its drivers, and the rule version that produced it.
          </p>

          {/* ── pipeline ────────────────────────────────────────── */}
          <div className="mt-12 divide-y divide-line border-y border-line">
            {PIPELINE.map((s, i) => (
              <motion.div key={s.n}
                initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-70px" }}
                transition={{ duration: 0.55, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="group grid gap-5 py-7 md:grid-cols-[70px_minmax(0,220px)_minmax(0,1fr)_150px]">
                <span className="readout text-[13px] text-dim2">{String(i + 1).padStart(2, "0")}</span>
                <h2 className="record text-[26px] leading-none text-halide">{s.n}</h2>
                <p className="text-[13.5px] leading-relaxed text-dim">{s.body}</p>
                <span className="console self-start text-[7.5px] text-dim2">{s.tech}</span>
              </motion.div>
            ))}
          </div>

          {/* ── built vs designed ───────────────────────────────── */}
          <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div>
              <Eyebrow>What is running, and what is not</Eyebrow>
              <p className="mt-3 max-w-[56ch] text-[13px] leading-relaxed text-dim2">
                A prototype that overstates itself is worth less than one that draws the line clearly. This is
                the line.
              </p>
              <div className="mt-6 divide-y divide-line border-y border-line">
                {REAL.map(([what, state, tone], i) => (
                  <motion.div key={what}
                    initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: i * 0.05 }}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,270px)] items-baseline gap-5 py-3.5">
                    <span className="text-[13px] leading-snug text-halide">{what}</span>
                    <span className="flex items-baseline gap-2 text-[12px] leading-snug" style={{ color: TONE[tone] }}>
                      <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full" style={{ background: TONE[tone] }} />
                      {state}
                    </span>
                  </motion.div>
                ))}
              </div>
              <div className="mt-7 rounded-[3px] border border-line bg-deck p-6">
                <Eyebrow tone="#D9A441">The legal footing</Eyebrow>
                <p className="record mt-3 text-[15px] leading-[1.6] text-dim">{RULE_13}</p>
                <p className="mt-4 text-[12.5px] leading-relaxed text-dim2">
                  Which is exactly the standard the platform is built to: it produces a supplement, sits beside
                  the Gram Sabha resolution and oral testimony, and leaves the decision where the Act puts it.
                </p>
              </div>
            </div>

            {/* ── glossary, on paper ──────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="sheet self-start p-8">
              <div className="console text-[7.5px] text-ink2">Every term used on screen</div>
              <h2 className="record mt-2 text-[30px] leading-none text-ink">Glossary</h2>
              <dl className="mt-6 divide-y divide-ink/12 border-t border-ink/20">
                {GLOSSARY.map(([k, v]) => (
                  <div key={k} className="py-3.5">
                    <dt className="console text-[8px] text-brass2">{k}</dt>
                    <dd className="record mt-1.5 text-[13.5px] leading-relaxed text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          </div>

          <div className="mt-14 flex flex-wrap gap-3 border-t border-line pt-8">
            <Link to="/atlas" className="group flex items-center gap-3 bg-brass px-5 py-3 text-void transition-colors hover:bg-[#E9B75C]">
              <span className="console text-[9px]">Open the atlas</span>
              <IconArrow size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link to="/claim/FRA-DND-0007" className="flex items-center gap-3 border border-line2 px-5 py-3 text-halide transition-colors hover:border-halide">
              <span className="console text-[9px]">See one refusal answered</span>
            </Link>
          </div>
        </div>
      </div>
    </Shell>
  );
}
