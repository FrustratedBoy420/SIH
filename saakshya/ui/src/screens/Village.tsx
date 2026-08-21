import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Shell } from "../components/Shell";
import { Counter, Eyebrow } from "../components/Instruments";
import { IconArrow } from "../components/Icons";
import { CLAIMS, DISTRICT, PROFILES, profileFor, schemesForVillage } from "../engine/data";
import { WEIGHTS } from "../engine/setu";
import { REASONS } from "../engine/nyaya";
import { STATUS_COLOR } from "../lib/ui";

const COVER = [
  { key: "forest", label: "Forest", color: "#B23048" },
  { key: "agriculture", label: "Agriculture", color: "#7FD4D9" },
  { key: "settlement", label: "Settlement", color: "#C9CFD3" },
  { key: "water", label: "Water", color: "#2C5A78" },
] as const;

export default function Village() {
  const { code = PROFILES[0].lgd_code } = useParams();
  const p = profileFor(code) ?? PROFILES[0];
  const own = CLAIMS.filter((c) => c.village_lgd === p.lgd_code);
  const schemes = schemesForVillage(p.lgd_code);
  const [open, setOpen] = useState(0);

  return (
    <Shell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1420px] px-6 pt-6 pb-20 lg:px-10">
          {/* ── heading ─────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>Village FRA intelligence profile</Eyebrow>
              <h1 className="display-xl mt-2 text-[62px] text-halide">{p.name}</h1>
              <p className="readout mt-2 text-[12px] text-dim2">
                LGD {p.lgd_code} · {DISTRICT.name}, {DISTRICT.state} · {p.center[0].toFixed(3)}° N {p.center[1].toFixed(3)}° E
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PROFILES.map((v) => (
                <Link key={v.lgd_code} to={`/village/${v.lgd_code}`}
                  className={`console rounded-[2px] border px-2.5 py-1.5 text-[7.5px] transition-colors ${
                    v.lgd_code === p.lgd_code ? "border-halide text-halide" : "border-line2 text-dim2 hover:text-dim"
                  }`}>{v.name}</Link>
              ))}
            </div>
          </div>

          {/* ── four columns of state ──────────────────────────────── */}
          <div className="mt-8 grid gap-5 xl:grid-cols-4">
            <Card title="Rights on record">
              <div className="mt-3 space-y-3">
                {(["granted", "pending", "rejected"] as const).map((s, i) => {
                  const n = own.filter((c) => c.status === s).length;
                  return (
                    <div key={s}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[12.5px] text-dim">{s === "granted" ? "Recognised" : s === "pending" ? "Pending" : "Refused"}</span>
                        <span className="readout text-[15px] text-halide">{n}</span>
                      </div>
                      <div className="mt-1 h-[4px] bg-line">
                        <motion.div className="h-full" style={{ originX: 0, background: STATUS_COLOR[s] }}
                          initial={{ scaleX: 0 }} animate={{ scaleX: n / own.length }}
                          transition={{ duration: 0.8, delay: 0.15 + i * 0.08, ease: [0.16, 1, 0.3, 1] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
                {(["IFR", "CR", "CFR"] as const).map((t) => (
                  <div key={t}>
                    <div className="console text-[7px] text-dim2">{t}</div>
                    <div className="readout text-[15px] text-halide">{own.filter((c) => c.claim_type === t).length}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Land, as SEEMA segments it">
              <div className="mt-4 flex h-[9px] overflow-hidden rounded-[1px]">
                {COVER.map((c, i) => (
                  <motion.div key={c.key} style={{ background: c.color }}
                    initial={{ width: 0 }} animate={{ width: `${p.landcover[c.key]}%` }}
                    transition={{ duration: 0.9, delay: 0.2 + i * 0.09, ease: [0.16, 1, 0.3, 1] }} />
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {COVER.map((c) => (
                  <div key={c.key} className="flex items-center gap-2.5">
                    <span className="h-[8px] w-[8px] shrink-0" style={{ background: c.color }} />
                    <span className="flex-1 text-[12.5px] text-dim">{c.label}</span>
                    <span className="readout text-[12px] text-halide">{p.landcover[c.key]}%</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 border-t border-line pt-3 text-[10.5px] leading-relaxed text-dim2">
                Sentinel-2 at 10 m, four classes. Reported per class, never as a single aggregate score.
              </p>
            </Card>

            <Card title="Infrastructure and access">
              <div className="mt-3 space-y-3.5">
                <Meter label="Water access" value={p.water_index} />
                <Meter label="Irrigation coverage" value={p.irrigation} />
                <Meter label="Road connectivity" value={p.road_connectivity} />
                <div className="flex items-baseline justify-between border-t border-line pt-3">
                  <span className="text-[12.5px] text-dim">Cultivable area</span>
                  <span className="readout text-[15px] text-halide">{p.cultivable_area_ha} ha</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12.5px] text-dim">Scheduled Tribe population</span>
                  <span className="readout text-[15px] text-halide">{p.st_pct}%</span>
                </div>
                {p.dajgua_target && (
                  <div className="console rounded-[2px] border border-brass/40 bg-brass/10 px-2.5 py-1.5 text-[7.5px] text-brass">
                    On the DAJGUA target list
                  </div>
                )}
              </div>
            </Card>

            <Card title="What the archive holds here">
              <div className="mt-3">
                <div className="readout text-[46px] leading-none text-soil">
                  <Counter to={p.recoverable} duration={1.3} />
                  <span className="text-[20px] text-dim2"> / {p.rejected}</span>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-dim">
                  refused claims where the archive speaks to the recorded ground.
                </p>
              </div>
              <div className="mt-4 space-y-2 border-t border-line pt-3">
                {Object.entries(
                  own.filter((c) => c.rejection_order).reduce<Record<string, number>>((a, c) => {
                    const k = c.rejection_order!.reason_category;
                    a[k] = (a[k] ?? 0) + 1;
                    return a;
                  }, {}),
                ).map(([k, n]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[11.5px] text-dim2">{REASONS[k as keyof typeof REASONS].short}</span>
                    <span className="readout text-[11.5px] text-dim">{n}</span>
                  </div>
                ))}
              </div>
              <Link to="/atlas" className="console mt-4 inline-flex items-center gap-1.5 border-b border-brass pb-0.5 text-[8px] text-brass">
                See them on the map <IconArrow size={12} />
              </Link>
            </Card>
          </div>

          {/* ── the recommendation, with its working shown ─────────── */}
          <div className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>Development priorities</Eyebrow>
                <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-dim">
                  Ranked by a weighted gap model. Open any recommendation to see the data it read, the rule it
                  applied, and the arithmetic — a recommendation without its working is not usable by an officer.
                </p>
              </div>
              <div className="text-right">
                <div className="console text-[7.5px] text-dim2">Priority score</div>
                <div className="readout text-[34px] leading-none"
                  style={{ color: p.priorityBand === "critical" ? "#E8446B" : p.priorityBand === "high" ? "#D9A441" : "#8B9AA3" }}>
                  <Counter to={p.priority} decimals={2} />
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {p.interventions.map((iv, i) => (
                <div key={iv.label} className="overflow-hidden rounded-[3px] border border-line bg-deck">
                  <button onClick={() => setOpen(open === i ? -1 : i)}
                    className="flex w-full items-center gap-5 px-6 py-4 text-left transition-colors hover:bg-deckr">
                    <span className="readout text-[13px] text-dim2">{String(iv.rank).padStart(2, "0")}</span>
                    <span className="record flex-1 text-[21px] leading-none text-halide">{iv.label}</span>
                    <span className="hidden gap-1.5 md:flex">
                      {iv.schemes.map((s) => (
                        <span key={s} className="console rounded-[2px] border border-line2 px-2 py-1 text-[7px] text-dim2">{s}</span>
                      ))}
                    </span>
                    <motion.span animate={{ rotate: open === i ? 90 : 0 }} className="text-dim2">
                      <IconArrow size={15} />
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {open === i && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                        <div className="grid gap-px border-t border-line bg-line md:grid-cols-4">
                          <Step n="Data read" delay={0.05}>
                            <ul className="space-y-1.5">
                              {iv.why.map((w) => (
                                <li key={w} className="flex gap-2 text-[11.5px] leading-relaxed text-dim">
                                  <span className="mt-[7px] h-px w-2.5 shrink-0 bg-line2" />{w}
                                </li>
                              ))}
                            </ul>
                          </Step>
                          <Step n="Rule applied" delay={0.12}>
                            <p className="readout text-[11px] leading-relaxed text-dim">
                              priority = {WEIGHTS.map((w) => `${w.w} × ${w.label.split(" ")[0].toLowerCase()}`).join(" + ")}
                            </p>
                            <p className="mt-2.5 text-[11.5px] leading-relaxed text-dim2">
                              Declarative weights held in configuration, changeable by the department without a code release.
                            </p>
                          </Step>
                          <Step n="Arithmetic" delay={0.19}>
                            <div className="space-y-1.5">
                              {WEIGHTS.map((w) => (
                                <div key={w.key} className="flex items-baseline justify-between gap-3">
                                  <span className="text-[11px] text-dim2">{w.label}</span>
                                  <span className="readout text-[11px] text-dim">
                                    {w.w.toFixed(2)}×{p.gaps[w.key as keyof typeof p.gaps].toFixed(2)} = {(w.w * p.gaps[w.key as keyof typeof p.gaps]).toFixed(3)}
                                  </span>
                                </div>
                              ))}
                              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                                <span className="console text-[7.5px] text-halide">Total</span>
                                <span className="readout text-[13px] text-halide">{p.priority.toFixed(3)}</span>
                              </div>
                            </div>
                          </Step>
                          <Step n="Convergence" delay={0.26}>
                            <div className="space-y-2">
                              {schemes.filter((s) => iv.schemes.some((x) => s.name.startsWith(x.split(" ")[0]))).map((s) => (
                                <div key={s.code}>
                                  <div className="text-[12px]" style={{ color: s.eligible ? "#4FA86B" : "#5D6D77" }}>{s.name}</div>
                                  <div className="mt-0.5 text-[10.5px] leading-relaxed text-dim2">{s.because[0]}</div>
                                </div>
                              ))}
                              <p className="border-t border-line pt-2 text-[10.5px] leading-relaxed text-dim2">
                                An officer confirms or overrides. The override is written to the record with a reason.
                              </p>
                            </div>
                          </Step>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-[3px] border border-line bg-deck p-5">
      <Eyebrow>{title}</Eyebrow>
      {children}
    </motion.div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const tone = value < 0.3 ? "#E8446B" : value < 0.55 ? "#D9A441" : "#4FA86B";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] text-dim">{label}</span>
        <span className="readout text-[12px]" style={{ color: tone }}>{value.toFixed(2)}</span>
      </div>
      <div className="mt-1 h-[4px] bg-line">
        <motion.div className="h-full" style={{ originX: 0, background: tone }}
          initial={{ scaleX: 0 }} animate={{ scaleX: value }} transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }} />
      </div>
    </div>
  );
}

function Step({ n, children, delay }: { n: string; children: React.ReactNode; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}
      className="bg-deck px-5 py-5">
      <div className="console text-[7.5px] text-brass">{n}</div>
      <div className="mt-3">{children}</div>
    </motion.div>
  );
}
