import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Shell } from "../components/Shell";
import { ParcelFrame } from "../components/ParcelFrame";
import { Stamp, Eyebrow } from "../components/Instruments";
import { IconCheck, IconDoc } from "../components/Icons";
import { claimById, kaalFor, nyayaFor, parcelRing, villageName, DISTRICT } from "../engine/data";
import { CUTOFF, SENSOR_LABEL, TRAJECTORY_LABEL } from "../engine/kaal";
import { REASONS, RULE_13, VERDICT_UI } from "../engine/nyaya";
import { fmtDate } from "../lib/ui";

const STEPS = [
  "Reading the claim record",
  "Pulling the annual archive stack, 1967 to 2025",
  "Running segmentation over the full series",
  "Compositing the decade frame strip",
  "Matching the finding to the recorded ground",
  "Attaching the Rule 13 citation",
  "Routing the appeal and computing the window",
  "Reserving the testimony and resolution slots",
];

export default function Dossier() {
  const { id = "FRA-DND-0007" } = useParams();
  const claim = claimById.get(id);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setStep(i);
      if (i > STEPS.length) clearInterval(t);
    }, 340);
    return () => clearInterval(t);
  }, [id]);

  if (!claim) return <Shell><div className="p-10 text-dim">No such claim.</div></Shell>;
  const kaal = kaalFor(id);
  const nyaya = nyayaFor(id);
  const built = step > STEPS.length;
  const strip = [1967, 1975, 1985, 1995, 2005, 2015, 2025]
    .map((y) => kaal.frames.find((f) => f.year === y)!)
    .filter(Boolean);
  const ring = parcelRing(claim);

  return (
    <Shell claimId={id}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-6 pt-6 pb-20 lg:grid-cols-[300px_minmax(0,1fr)] lg:px-10">
          {/* ── the build log ───────────────────────────────────── */}
          <div className="lg:sticky lg:top-6 lg:self-start print:hidden">
            <Eyebrow>Assembling the evidence dossier</Eyebrow>
            <h1 className="display-xl mt-2 text-[34px] text-halide">One claim in, one filing out</h1>
            <p className="mt-2 text-[12.5px] leading-relaxed text-dim">
              Every step below is automatic except the Corona georeference, which a human still does once per
              sheet. We do not claim zero-touch.
            </p>

            <ol className="mt-6 space-y-2.5">
              {STEPS.map((s, i) => {
                const done = step > i;
                const active = step === i;
                return (
                  <li key={s} className="flex items-start gap-2.5">
                    <span className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors"
                      style={{ borderColor: done ? "#4FA86B" : active ? "#F5EFE2" : "#2E3F4B", background: done ? "#4FA86B" : "transparent" }}>
                      {done && <IconCheck size={9} className="text-void" />}
                      {active && <motion.span className="h-1.5 w-1.5 rounded-full bg-halide"
                        animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />}
                    </span>
                    <span className={`text-[12px] leading-snug transition-colors ${done ? "text-dim" : active ? "text-halide" : "text-dim2"}`}>{s}</span>
                  </li>
                );
              })}
            </ol>

            <AnimatePresence>
              {built && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-2">
                  <button onClick={() => window.print()}
                    className="flex w-full items-center justify-between rounded-[2px] bg-carmine px-4 py-3 text-void transition-colors hover:bg-[#F05A7E]">
                    <span className="console text-[9px]">Print or save the dossier</span>
                    <IconDoc size={15} />
                  </button>
                  <Link to={`/sabha/${id}`}
                    className="flex w-full items-center justify-between rounded-[2px] border border-line2 px-4 py-3 text-halide transition-colors hover:border-halide">
                    <span className="console text-[9px]">Hand it to the Gram Sabha</span>
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── the sheet ───────────────────────────────────────── */}
          <motion.article
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="sheet mx-auto w-full max-w-[860px] px-10 py-9 print:max-w-none print:shadow-none"
          >
            {/* letterhead */}
            <Piece show={step > 0}>
              <div className="flex items-start justify-between border-b-[2px] border-ink pb-4">
                <div>
                  <div className="console text-[8px] text-ink2">Evidence dossier · prepared for human review</div>
                  <div className="record mt-1 text-[30px] leading-none font-medium text-ink">Saakshya</div>
                </div>
                <div className="text-right">
                  <div className="console text-[7.5px] text-ink2">Claim</div>
                  <div className="readout text-[17px] text-ink">{claim.claim_id}</div>
                  <div className="console mt-1 text-[7.5px] text-ink2">Issued {fmtDate("2026-08-21")}</div>
                </div>
              </div>
            </Piece>

            {/* particulars */}
            <Piece show={step > 0} delay={0.05}>
              <div className="grid grid-cols-4 gap-6 border-b border-ink/20 py-4">
                {[
                  ["Village", villageName(claim.village_lgd)],
                  ["District", `${DISTRICT.name}, ${DISTRICT.state}`],
                  ["Right claimed", claim.claim_type],
                  ["Claimant category", claim.claimant_category],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="console text-[7px] text-ink2">{k}</div>
                    <div className="record mt-1 text-[15px] text-ink">{v}</div>
                  </div>
                ))}
              </div>
            </Piece>

            {/* the parcel and the finding */}
            <Piece show={step > 2} delay={0.05}>
              <div className="grid grid-cols-[210px_minmax(0,1fr)] gap-7 py-6">
                <figure>
                  <div className="relative aspect-square bg-void p-1.5">
                    <div className="relative h-full w-full">
                      <ParcelFrame params={{ seed: kaal.seed, canopy: kaal.frames[kaal.frames.length - 1].canopy, sensor: "s2", trajectory: kaal.trajectory_class, year: 2025, obs: 40, res: 512, detail: 1.5 }} />
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                        <path d={ringPath(ring)} fill="rgba(245,239,226,0.06)" stroke="#F5EFE2" strokeWidth="0.5" strokeDasharray="2 1.4" vectorEffect="non-scaling-stroke" />
                      </svg>
                    </div>
                  </div>
                  <figcaption className="console mt-1.5 text-[7px] text-ink2">
                    Parcel as segmented, {claim.area_ha} ha · illustrative boundary
                  </figcaption>
                </figure>

                <div>
                  <div className="console text-[7.5px] text-ink2">Finding</div>
                  <p className="record mt-2 text-[23px] leading-[1.25] text-ink">
                    The archive dates the transition from canopy to cultivation on this parcel to about{" "}
                    <span className="border-b-[2px] border-carmine2 pb-0.5">{kaal.conversion_year}</span>
                    {kaal.conversion_year < CUTOFF && ` — ${CUTOFF - kaal.conversion_year} years before the statutory cutoff.`}
                  </p>
                  <div className="mt-5 grid grid-cols-3 gap-5 border-t border-ink/20 pt-4">
                    <Small k="Trajectory" v={TRAJECTORY_LABEL[kaal.trajectory_class]} />
                    <Small k="Confidence" v={kaal.confidence.toFixed(2)} />
                    <Small k="Corona georeference" v={`${kaal.confidence_drivers.corona_registration_rmse_m} m RMSE`} />
                  </div>
                </div>
              </div>
            </Piece>

            {/* the strip */}
            <Piece show={step > 3} delay={0.05}>
              <div className="border-t border-ink/20 py-5">
                <div className="console text-[7.5px] text-ink2">Decade frame strip</div>
                <div className="mt-2.5 grid grid-cols-7 gap-1.5">
                  {strip.map((f, i) => (
                    <motion.figure key={f.year}
                      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.1 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}>
                      <div className="relative aspect-square bg-void">
                        <ParcelFrame params={{ seed: kaal.seed, canopy: f.canopy, sensor: f.sensor, trajectory: kaal.trajectory_class, year: f.year, obs: f.obs, res: 288, detail: 1.15 }} />
                      </div>
                      <figcaption className="readout mt-1 text-[9px] text-ink2">{f.year}</figcaption>
                      <div className="console text-[5.5px] leading-tight text-ink2/70">{SENSOR_LABEL[f.sensor]}</div>
                    </motion.figure>
                  ))}
                </div>
              </div>
            </Piece>

            {/* the match */}
            {nyaya && (
              <Piece show={step > 4} delay={0.05}>
                <div className="border-t border-ink/20 py-5">
                  <div className="console text-[7.5px] text-ink2">Ground recorded for refusal, matched</div>
                  <table className="mt-3 w-full border-collapse">
                    <tbody className="record text-[13.5px] text-ink">
                      <Tr k="Recorded ground" v={REASONS[nyaya.reason].label} />
                      <Tr k="Order" v={`${claim.rejection_order!.rejecting_body} · ${fmtDate(claim.rejection_order!.order_date)}`} />
                      <Tr k="Evidence that answers it" v={nyaya.answeredBy} />
                      <Tr k="Held for this claim" v={VERDICT_UI[nyaya.verdict].label} strong />
                      <Tr k="Appeal lies to" v={`${nyaya.forum} · ${nyaya.statute}`} />
                      <Tr k="Window" v={nyaya.deadline ? `${fmtDate(nyaya.deadline)} — ${nyaya.window === "LAPSED" ? "closed" : "open"}` : "—"} />
                    </tbody>
                  </table>
                </div>
              </Piece>
            )}

            {/* the citation, and the two things the village must add */}
            <Piece show={step > 5} delay={0.05}>
              <div className="border-t border-ink/20 py-5">
                <div className="console text-[7.5px] text-ink2">Legal basis</div>
                <p className="record mt-2 text-[13.5px] leading-relaxed text-ink">{RULE_13}</p>
              </div>
            </Piece>

            <Piece show={step > 7} delay={0.05}>
              <div className="grid grid-cols-2 gap-5 border-t border-ink/20 py-5">
                {["Oral testimony of the Gram Sabha", "Gram Sabha resolution"].map((t) => (
                  <div key={t} className="border-[1.5px] border-dashed border-ink/30 px-4 py-6">
                    <div className="console text-[7.5px] text-ink2">To be attached</div>
                    <div className="record mt-1.5 text-[16px] text-ink">{t}</div>
                    <div className="mt-6 h-px bg-ink/25" />
                    <div className="console mt-1.5 text-[6.5px] text-ink2">signature and date</div>
                  </div>
                ))}
              </div>
            </Piece>

            <Piece show={built} delay={0.1}>
              <div className="flex items-end justify-between border-t-[2px] border-ink pt-5">
                <p className="max-w-[52ch] text-[11px] leading-relaxed text-ink2">
                  This dossier is an evidence bundle prepared to assist human review. It does not determine
                  forest rights, and its confidence figure describes evidence strength, not legal validity.
                  Claim records in this prototype are synthetic.
                </p>
                {nyaya && (
                  <Stamp lines={["Saakshya", "evidence bundle", DISTRICT.name.toUpperCase()]} tone="#7A2B3C" rotate={-7} delay={0.2} size={1.15} />
                )}
              </div>
            </Piece>
          </motion.article>
        </div>
      </div>
    </Shell>
  );
}

function ringPath(ring: [number, number][]) {
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sp = Math.max(x1 - x0, y1 - y0) / 0.62;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return (
    ring.map(([x, y], i) => `${i ? "L" : "M"}${(50 + ((x - cx) / sp) * 100).toFixed(2)},${(50 - ((y - cy) / sp) * 100).toFixed(2)}`).join("") + "Z"
  );
}

function Piece({ show, delay = 0, children }: { show: boolean; delay?: number; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, y: 16, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Small({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="console text-[7px] text-ink2">{k}</div>
      <div className="record mt-1 text-[13px] leading-snug text-ink">{v}</div>
    </div>
  );
}

function Tr({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <tr className="border-b border-ink/12 last:border-0">
      <td className="console w-[190px] py-2.5 align-top text-[7px] text-ink2">{k}</td>
      <td className={`py-2.5 align-top ${strong ? "font-semibold" : ""}`}>{v}</td>
    </tr>
  );
}
