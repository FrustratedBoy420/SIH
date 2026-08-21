import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Shell } from "../components/Shell";
import { Chronoscope } from "../components/Chronoscope";
import { ParcelViewport } from "../components/ParcelViewport";
import { NdviTrace } from "../components/NdviTrace";
import { ConfidenceDial, Counter, Driver, Eyebrow, Stamp } from "../components/Instruments";
import { Sheet, SheetHead, Field, Quoted } from "../components/Sheet";
import { IconArrow, IconDoc } from "../components/Icons";
import { CLAIMS, claimById, kaalFor, nyayaFor, villageName, evidenceStrength, CURATED_IDS } from "../engine/data";
import { CUTOFF, TRAJECTORY_LABEL } from "../engine/kaal";
import { REASONS, RULE_13, VERDICT_UI } from "../engine/nyaya";
import { TONE_COLOR, fmtDate } from "../lib/ui";

export default function Evidence() {
  const { id = "FRA-DND-0007" } = useParams();
  const nav = useNavigate();
  const claim = claimById.get(id);
  const kaal = useMemo(() => (claim ? kaalFor(id) : null), [claim, id]);
  const nyaya = useMemo(() => (claim ? nyayaFor(id) : null), [claim, id]);
  const [year, setYear] = useState(1967);

  useEffect(() => { setYear(1967); }, [id]);

  if (!claim || !kaal) return <Shell><div className="p-10 text-dim">No such claim.</div></Shell>;

  const frame = kaal.frames.find((f) => f.year === year) ?? kaal.frames[0];
  const beforeCutoff = year < CUTOFF;
  const conv = kaal.conversion_year;
  const v = nyaya ? VERDICT_UI[nyaya.verdict] : null;
  const strength = evidenceStrength(id);

  return (
    <Shell claimId={id}>
      <div className="h-full overflow-y-auto lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_468px] lg:overflow-hidden">
        {/* ── the archive side ─────────────────────────────────────── */}
        <div className="px-5 pt-5 pb-10 lg:min-h-0 lg:overflow-y-auto lg:px-8 lg:pb-16">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>KAAL · historic evidence engine</Eyebrow>
              <h1 className="display-xl mt-2 text-[46px] text-halide">
                {villageName(claim.village_lgd)}
                <span className="readout ml-3 align-middle text-[15px] font-normal tracking-normal text-dim2">{claim.claim_id}</span>
              </h1>
              <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-dim">
                {claim.claim_type} claim over {claim.area_ha} ha, filed by a {claim.claimant_category} household.
                The archive was read back to 1967 to date when this ground stopped being canopy.
              </p>
            </div>
            <ClaimSwitcher current={id} onPick={(n) => nav(`/claim/${n}`)} />
          </div>

          <div className="relative">
            <ParcelViewport claim={claim} kaal={kaal} frame={frame} className="aspect-[16/7.6] w-full rounded-[3px] ring-1 ring-line2" />

            {/* the moment that matters: which side of the cutoff you are on */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={beforeCutoff ? "pre" : "post"}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  className={`mb-3 flex items-center gap-3 rounded-[2px] px-4 py-2 backdrop-blur-md ${
                    beforeCutoff ? "bg-carmine/25 ring-1 ring-carmine/60" : "bg-void/85 ring-1 ring-line2"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${beforeCutoff ? "animate-[blink_1.4s_steps(1,end)_infinite] bg-carmine" : "bg-dim2"}`} />
                  <span className="console text-[9px] text-halide">
                    {beforeCutoff
                      ? `${CUTOFF - year} years before the statutory cutoff`
                      : `${year - CUTOFF} years after the statutory cutoff`}
                  </span>
                  <span className="h-3 w-px bg-halide/25" />
                  <span className="readout text-[10.5px] text-dim">
                    canopy {(frame.canopy * 100).toFixed(0)}%
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-5">
            <Chronoscope kaal={kaal} year={year} onYear={setYear} />
          </div>

          {/* the trace */}
          <div className="mt-9 border-t border-line pt-5">
            <div className="flex items-end justify-between">
              <div>
                <Eyebrow>Spectral trace · annual dry-season NDVI</Eyebrow>
                <p className="mt-2 max-w-[58ch] text-[12.5px] leading-relaxed text-dim">
                  Grey is the raw annual series; small dots are years built from fewer than six cloud-free scenes.
                  The white line is the LandTrendr segmented fit — the breakpoint is read off the fit, never off the raw series.
                </p>
              </div>
              <div className="hidden shrink-0 gap-5 text-right sm:flex">
                <div>
                  <div className="console text-[8px] text-soil">Break detected</div>
                  <div className="readout text-[26px] leading-none text-soil"><Counter to={conv} duration={1.2} delay={2.2} /></div>
                </div>
                <div>
                  <div className="console text-[8px] text-carmine">Cutoff</div>
                  <div className="readout text-[26px] leading-none text-carmine">2005</div>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <NdviTrace kaal={kaal} year={year} onYear={setYear} />
            </div>
          </div>

          {/* confidence, and what drives it */}
          <div className="mt-9 grid grid-cols-1 gap-8 border-t border-line pt-6 md:grid-cols-[auto_minmax(0,1fr)]">
            <div>
              <ConfidenceDial value={kaal.confidence} />
            </div>
            <div>
              <Eyebrow>Why this number</Eyebrow>
              <p className="mt-2 mb-1 max-w-[60ch] text-[12.5px] leading-relaxed text-dim">
                Confidence describes evidence strength, not legal validity. It falls when the archive is thin
                around the break, when the change is shallow, or when the Corona sheet registers poorly.
              </p>
              <div className="divide-y divide-line">
                <Driver
                  label="Cloud-free years within ±5 of the break"
                  value={kaal.confidence_drivers.valid_observation_years / 11}
                  note={`${kaal.confidence_drivers.valid_observation_years} / 11`} delay={0.1}
                />
                <Driver
                  label="Break magnitude in NDVI"
                  value={kaal.confidence_drivers.break_magnitude_ndvi / 0.8}
                  note={kaal.confidence_drivers.break_magnitude_ndvi.toFixed(2)} delay={0.18}
                />
                <Driver
                  label="Trajectory classifier probability"
                  value={kaal.confidence_drivers.classifier_probability}
                  note={kaal.confidence_drivers.classifier_probability.toFixed(2)} delay={0.26}
                />
                <Driver
                  label="Corona georeference error (lower is better)"
                  value={1 - kaal.confidence_drivers.corona_registration_rmse_m / 20}
                  note={`${kaal.confidence_drivers.corona_registration_rmse_m} m RMSE`} delay={0.34}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Tag>{TRAJECTORY_LABEL[kaal.trajectory_class]}</Tag>
                <Tag>Corona KH-4B sheet available</Tag>
                <Tag>One manual georeference step</Tag>
              </div>
            </div>
          </div>

          <p className="mt-8 max-w-[76ch] border-t border-line pt-5 text-[11.5px] leading-relaxed text-dim2">
            {RULE_13}
          </p>
        </div>

        {/* ── the record side ───────────────────────────────────────── */}
        <aside className="border-line bg-deck px-5 pt-2 pb-16 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:pt-5">
          {claim.rejection_order && nyaya ? (
            <Sheet delay={0.15}>
              <SheetHead
                kicker={`Order of the ${claim.rejection_order.rejecting_body === "GS" ? "Gram Sabha" : claim.rejection_order.rejecting_body}`}
                title="Why this claim was refused"
                right={
                  <div className="text-right">
                    <div className="console text-[7.5px] text-ink2">Order dated</div>
                    <div className="readout text-[13px] text-ink">{fmtDate(claim.rejection_order.order_date)}</div>
                  </div>
                }
              />
              <div className="px-8 pb-7">
                <div className="grid grid-cols-2 gap-x-6 divide-ink/10">
                  <Field label="Claim">{claim.claim_id}</Field>
                  <Field label="Category">{claim.claimant_category === "ST" ? "Scheduled Tribe" : "Other Traditional Forest Dweller"}</Field>
                </div>

                <div className="mt-1">
                  <div className="console text-[7.5px] text-ink2">Recorded ground</div>
                  <p className="record mt-1.5 text-[16px] leading-snug text-ink">{REASONS[nyaya.reason].label}</p>
                </div>

                <div className="mt-4">
                  <Quoted text={claim.rejection_order.raw_text} ocr={claim.rejection_order.ocr_confidence} />
                </div>

                {/* the match */}
                <div className="mt-7 border-t-[1.5px] border-ink/25 pt-5">
                  <div className="console text-[7.5px] text-ink2">What the archive returns against that ground</div>
                  <p className="record mt-2 text-[15.5px] leading-[1.55] text-ink">{nyaya.finding}</p>
                </div>

                <div className="mt-6 flex items-center justify-between gap-4">
                  <div>
                    <div className="console text-[7.5px] text-ink2">Evidence strength</div>
                    <div className="readout text-[30px] leading-none text-ink">
                      <Counter to={strength} decimals={2} delay={0.9} />
                    </div>
                    <div className="record mt-0.5 text-[12px] text-ink2 italic">
                      {v?.label.toLowerCase()}
                    </div>
                  </div>
                  <Stamp
                    lines={
                      nyaya.verdict === "ANSWERED" ? ["Ground answered", `imagery dates ${conv}`]
                      : nyaya.verdict === "STRENGTHENED_NOT_PROVEN" ? ["Strengthened", "not proven"]
                      : nyaya.verdict === "ROUTE_TO_SEEMA" ? ["Boundary", "referred"]
                      : nyaya.verdict === "CONTRADICTED" ? ["Withheld", "dual-use rule"]
                      : ["Outside", "imagery scope"]
                    }
                    tone={nyaya.verdict === "ANSWERED" ? "#2F7A4C" : nyaya.verdict === "CONTRADICTED" ? "#7A2B3C" : "#9A6420"}
                    delay={1.1}
                  />
                </div>

                <div className="mt-7 flex flex-col gap-2 border-t-[1.5px] border-ink/25 pt-5">
                  <Link to={`/decision/${id}`}
                    className="group flex items-center justify-between rounded-[2px] bg-ink px-4 py-3 text-paper transition-transform hover:-translate-y-px">
                    <span className="console text-[9px]">Open the appeal route</span>
                    <IconArrow size={15} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link to={`/dossier/${id}`}
                    className="group flex items-center justify-between rounded-[2px] border-[1.5px] border-ink/30 px-4 py-3 text-ink transition-colors hover:border-ink">
                    <span className="console text-[9px]">Assemble the evidence dossier</span>
                    <IconDoc size={15} />
                  </Link>
                </div>
              </div>
            </Sheet>
          ) : (
            <Sheet delay={0.15}>
              <SheetHead kicker="Status" title="This claim was not refused" />
              <div className="px-8 pb-8">
                <p className="record text-[15px] leading-relaxed text-ink">
                  {claim.claim_id} is currently <b>{claim.status}</b>. The archive read is shown for the
                  record — the evidence engine runs on every parcel, not only on refusals, so that a
                  village profile can report continuity across all of its claims.
                </p>
                <Field label="Filed">{fmtDate(claim.filed_date)}</Field>
              </div>
            </Sheet>
          )}

          <div className="mt-4 rounded-[2px] border border-line bg-deckr p-4">
            <Eyebrow>Provenance</Eyebrow>
            <dl className="mt-3 space-y-2">
              {[
                ["Archive", "Landsat MSS/TM/ETM+/OLI, Sentinel-2, Corona KH-4B"],
                ["Segmentation", "LandTrendr, run over the full stack for pre-1999 dating"],
                ["Composite", "Dry-season (Nov–Mar), cloud-masked, no gap interpolation"],
                ["Rule version", "nyaya/rules.json @ 2026.02"],
                ["Record source", CURATED_IDS.has(id) ? "Curated demonstration record" : "Generated to fill the block"],
              ].map(([k, val]) => (
                <div key={k} className="grid grid-cols-[104px_minmax(0,1fr)] gap-3">
                  <dt className="console text-[7.5px] text-dim2">{k}</dt>
                  <dd className="readout text-[10.5px] leading-relaxed text-dim">{val}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="console rounded-[2px] border border-line2 px-2 py-1 text-[7.5px] text-dim">{children}</span>;
}

function ClaimSwitcher({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  const featured = CLAIMS.filter((c) => CURATED_IDS.has(c.claim_id) && c.status === "rejected").slice(0, 6);
  return (
    <div className="flex items-center gap-1.5">
      <span className="console mr-1 text-[7.5px] text-dim2">Other refusals</span>
      {featured.map((c) => {
        const n = nyayaFor(c.claim_id);
        const tone = n ? TONE_COLOR[VERDICT_UI[n.verdict].tone] : "#8B9AA3";
        const on = c.claim_id === current;
        return (
          <button key={c.claim_id} onClick={() => onPick(c.claim_id)}
            title={`${c.claim_id} — ${REASONS[c.rejection_order!.reason_category].short}`}
            className={`readout rounded-[2px] border px-2 py-1.5 text-[10px] transition-all ${
              on ? "border-halide bg-deckh text-halide" : "border-line2 text-dim2 hover:border-dim2 hover:text-dim"
            }`}>
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: tone }} />
            {c.claim_id.slice(-4)}
          </button>
        );
      })}
    </div>
  );
}
