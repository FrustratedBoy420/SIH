import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { Shell } from "../components/Shell";
import { Counter, Eyebrow } from "../components/Instruments";
import { IconArrow, IconCheck, IconAlert, IconX } from "../components/Icons";
import { claimById, kaalFor, nyayaFor, profileFor, schemesForVillage, villageName } from "../engine/data";
import { REASONS, RULE_13, TODAY, VERDICT_UI } from "../engine/nyaya";
import { WEIGHTS } from "../engine/setu";
import { TONE_COLOR, fmtDate, stack, stackItem } from "../lib/ui";

const LADDER = [
  { code: "GS", label: "Gram Sabha", note: "Verifies and recommends the claim" },
  { code: "SDLC", label: "Sub-Divisional Level Committee", note: "First appeal under s.6(2)" },
  { code: "DLC", label: "District Level Committee", note: "Final appeal under s.6(4)" },
  { code: "HC", label: "State review / writ", note: "Beyond the statutory ladder" },
];

export default function Decision() {
  const { id = "FRA-DND-0007" } = useParams();
  const claim = claimById.get(id);
  const nyaya = useMemo(() => (claim ? nyayaFor(id) : null), [claim, id]);
  const kaal = useMemo(() => (claim ? kaalFor(id) : null), [claim, id]);

  if (!claim || !nyaya || !kaal) {
    return (
      <Shell claimId={id}>
        <div className="flex h-full items-center justify-center px-8">
          <div className="max-w-[46ch] text-center">
            <Eyebrow className="justify-center">No appeal route</Eyebrow>
            <p className="record mt-3 text-[19px] leading-snug text-halide">
              {claim ? `${claim.claim_id} was not refused, so there is nothing to appeal.` : "No such claim."}
            </p>
            <Link to="/atlas" className="console mt-5 inline-block border-b border-brass pb-0.5 text-[9px] text-brass">Back to the atlas</Link>
          </div>
        </div>
      </Shell>
    );
  }

  const order = claim.rejection_order!;
  const v = VERDICT_UI[nyaya.verdict];
  const tone = TONE_COLOR[v.tone];
  const profile = profileFor(claim.village_lgd);
  const schemes = schemesForVillage(claim.village_lgd);
  const atIdx = LADDER.findIndex((l) => l.code === order.rejecting_body);
  const nextIdx = Math.min(LADDER.length - 1, atIdx + 1);

  const elapsed = Math.round((TODAY.getTime() - new Date(order.order_date + "T00:00:00Z").getTime()) / 86400000);
  const frac = Math.min(1, elapsed / 60);

  return (
    <Shell claimId={id}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1360px] px-6 pt-6 pb-20 lg:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>NYAYA · appeal decision support</Eyebrow>
              <h1 className="display-xl mt-2 text-[52px] text-halide">What can be done next</h1>
              <p className="mt-2 max-w-[64ch] text-[13.5px] leading-relaxed text-dim">
                The recorded ground for refusal is matched against the evidence the platform actually holds,
                then routed to the forum that can hear it. Nothing here decides the claim — it prepares it.
              </p>
            </div>
            <Link to={`/claim/${id}`}
              className="group flex items-center gap-2 rounded-[2px] border border-line2 px-4 py-2.5 text-dim transition-colors hover:border-halide hover:text-halide">
              <span className="console text-[8.5px]">Back to the archive</span>
              <IconArrow size={14} className="rotate-180 transition-transform group-hover:-translate-x-1" />
            </Link>
          </div>

          {/* ── the match ─────────────────────────────────────────── */}
          <motion.div variants={stack} initial="hidden" animate="show" className="mt-9 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
            <motion.div variants={stackItem} className="rounded-[3px] border border-line bg-deck">
              <div className="border-b border-line px-6 py-4">
                <Eyebrow>Ground for refusal, matched against held evidence</Eyebrow>
              </div>

              <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
                <Column kicker="Recorded ground" tone="#E8446B">
                  <p className="text-[14px] leading-snug text-halide">{REASONS[nyaya.reason].label}</p>
                  <p className="record mt-2 text-[12.5px] leading-relaxed text-dim italic">“{order.raw_text}”</p>
                </Column>
                <Column kicker="Evidence that answers it" tone="#7FD4D9">
                  <p className="text-[14px] leading-snug text-halide">{nyaya.answeredBy}</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-dim">Produced by {nyaya.band}.</p>
                </Column>
                <Column kicker="What is held for this claim" tone={tone}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0" style={{ color: tone }}>
                      {v.tone === "ok" ? <IconCheck size={15} /> : v.tone === "bad" ? <IconX size={15} /> : <IconAlert size={15} />}
                    </span>
                    <p className="text-[14px] leading-snug" style={{ color: tone }}>{v.label}</p>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-dim">{nyaya.finding}</p>
                </Column>
              </div>

              {/* ── the ladder ─────────────────────────────────────── */}
              <div className="border-t border-line px-6 py-6">
                <Eyebrow>Where this appeal goes</Eyebrow>
                <div className="mt-5 flex items-stretch">
                  {LADDER.map((l, i) => {
                    const past = i <= atIdx;
                    const here = i === nextIdx;
                    return (
                      <div key={l.code} className="flex min-w-0 flex-1 items-stretch">
                        <div className="min-w-0 flex-1">
                          <div className="relative h-[3px] bg-line">
                            <motion.div className="absolute inset-y-0 left-0 w-full bg-carmine"
                              initial={{ scaleX: 0 }} animate={{ scaleX: past ? 1 : here ? 0.5 : 0 }}
                              style={{ originX: 0 }} transition={{ duration: 0.6, delay: 0.25 + i * 0.12, ease: [0.16, 1, 0.3, 1] }} />
                            <motion.div
                              className="absolute top-1/2 left-0 h-[11px] w-[11px] -translate-y-1/2 rounded-full border-2"
                              initial={{ scale: 0 }} animate={{ scale: 1 }}
                              transition={{ duration: 0.35, delay: 0.3 + i * 0.12, ease: [0.34, 1.56, 0.64, 1] }}
                              style={{
                                borderColor: past ? "#E8446B" : here ? "#F5EFE2" : "#2E3F4B",
                                background: here ? "#F5EFE2" : "#07090C",
                                boxShadow: here ? "0 0 14px rgba(245,239,226,0.6)" : "none",
                              }} />
                          </div>
                          <div className="pt-5 pr-4">
                            <div className={`console text-[8.5px] ${here ? "text-halide" : past ? "text-carmine" : "text-dim2"}`}>{l.label}</div>
                            <div className="mt-1 text-[11.5px] leading-snug text-dim2">{l.note}</div>
                            {past && <div className="console mt-1.5 text-[7.5px] text-carmine">refused here</div>}
                            {here && <div className="console mt-1.5 text-[7.5px] text-halide">appeal lies here</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>

            {/* ── the clock ──────────────────────────────────────── */}
            <motion.div variants={stackItem} className="rounded-[3px] border p-6"
              style={{ borderColor: nyaya.window === "LAPSED" ? "rgba(232,68,107,0.45)" : "#22303A",
                       background: nyaya.window === "LAPSED" ? "rgba(232,68,107,0.06)" : "#0E1419" }}>
              <Eyebrow tone={nyaya.window === "LAPSED" ? "#E8446B" : "#4FA86B"}>
                {nyaya.window === "LAPSED" ? "The window has closed" : "The window is open"}
              </Eyebrow>

              <DeadlineRing frac={frac} lapsed={nyaya.window === "LAPSED"} days={Math.abs(nyaya.daysLeft ?? 0)} />

              <dl className="mt-5 space-y-2.5 border-t border-line pt-4">
                <Row k="Order dated" v={fmtDate(order.order_date)} />
                <Row k="Sixty days ran to" v={nyaya.deadline ? fmtDate(nyaya.deadline) : "—"} />
                <Row k="Appeal lies to" v={nyaya.forum} />
                <Row k="Under" v={nyaya.statute} />
              </dl>

              <div className="mt-5 border-t border-line pt-4">
                <div className="console text-[7.5px] text-dim2">Next action</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-halide">{nyaya.nextAction}</p>
              </div>

              <Link to={`/dossier/${id}`}
                className="group mt-5 flex items-center justify-between rounded-[2px] bg-brass px-4 py-3 text-void transition-colors hover:bg-[#E9B75C]">
                <span className="console text-[9px]">Assemble the dossier</span>
                <IconArrow size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </motion.div>

          {/* ── SETU ───────────────────────────────────────────────── */}
          <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="rounded-[3px] border border-line bg-deck">
              <div className="flex items-end justify-between border-b border-line px-6 py-4">
                <Eyebrow>SETU · what recognition would unlock in {villageName(claim.village_lgd)}</Eyebrow>
                <Link to={`/village/${claim.village_lgd}`} className="console text-[8px] text-dim2 hover:text-halide">Village profile →</Link>
              </div>
              <div className="divide-y divide-line">
                {schemes.map((s, i) => (
                  <motion.div key={s.code}
                    initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] items-start gap-6 px-6 py-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0" style={{ color: s.eligible ? "#4FA86B" : "#5D6D77" }}>
                        {s.eligible ? <IconCheck size={14} /> : <IconX size={14} />}
                      </span>
                      <div>
                        <div className={`text-[13.5px] leading-snug ${s.eligible ? "text-halide" : "text-dim2"}`}>{s.name}</div>
                        <div className="console mt-1 text-[7.5px]" style={{ color: s.eligible ? "#4FA86B" : "#5D6D77" }}>
                          {s.eligible ? "Eligible on the recorded indicators" : "Not indicated"}
                        </div>
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {s.because.map((b) => (
                        <li key={b} className="flex gap-2 text-[11.5px] leading-relaxed text-dim">
                          <span className="mt-[7px] h-px w-2.5 shrink-0 bg-line2" />{b}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>
              <p className="border-t border-line px-6 py-3.5 text-[11px] leading-relaxed text-dim2">
                Eligibility is decided by a rule table, never by a model. A model may only phrase the explanation,
                and an officer signs the outcome.
              </p>
            </div>

            {/* the priority model, shown with its weights */}
            <div className="rounded-[3px] border border-line bg-deck p-6">
              <Eyebrow>Priority model · configurable by department</Eyebrow>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="readout text-[42px] leading-none text-halide"><Counter to={profile.priority} decimals={2} /></span>
                <span className="console text-[8.5px]" style={{ color: profile.priorityBand === "critical" ? "#E8446B" : profile.priorityBand === "high" ? "#D9A441" : "#8B9AA3" }}>
                  {profile.priorityBand} priority
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {WEIGHTS.map((w, i) => {
                  const g = profile.gaps[w.key as keyof typeof profile.gaps];
                  return (
                    <div key={w.key}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[12px] text-dim">{w.label}</span>
                        <span className="readout text-[10.5px] text-dim2">{w.w.toFixed(2)} × {g.toFixed(2)}</span>
                      </div>
                      <div className="mt-1 h-[3px] bg-line">
                        <motion.div className="h-full bg-halide/70"
                          initial={{ scaleX: 0 }} whileInView={{ scaleX: g }} viewport={{ once: true }} style={{ originX: 0 }}
                          transition={{ duration: 0.7, delay: 0.1 + i * 0.07, ease: [0.16, 1, 0.3, 1] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-5 border-t border-line pt-4 text-[11px] leading-relaxed text-dim2">
                Prototype weights. They are not government-approved and are exposed here so that a department
                can change them without touching the code.
              </p>
            </div>
          </div>

          <p className="mt-10 max-w-[92ch] border-t border-line pt-5 text-[11.5px] leading-relaxed text-dim2">{RULE_13}</p>
        </div>
      </div>
    </Shell>
  );
}

function Column({ kicker, tone, children }: { kicker: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5">
      <div className="console text-[7.5px]" style={{ color: tone }}>{kicker}</div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="console text-[7.5px] text-dim2">{k}</dt>
      <dd className="readout text-right text-[11.5px] text-halide">{v}</dd>
    </div>
  );
}

function DeadlineRing({ frac, lapsed, days }: { frac: number; lapsed: boolean; days: number }) {
  const R = 50, C = 2 * Math.PI * R;
  const tone = lapsed ? "#E8446B" : frac > 0.7 ? "#D9A441" : "#4FA86B";
  return (
    <div className="relative mx-auto mt-5 h-[152px] w-[152px]">
      <svg viewBox="0 0 152 152" className="h-full w-full -rotate-90">
        <circle cx="76" cy="76" r={R} fill="none" stroke="#22303A" strokeWidth="6" />
        <motion.circle cx="76" cy="76" r={R} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="butt"
          strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - frac) }}
          transition={{ duration: 1.5, delay: 0.4, ease: [0.16, 1, 0.3, 1] }} />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <line key={i} x1={76 + Math.cos(a) * (R - 12)} y1={76 + Math.sin(a) * (R - 12)}
            x2={76 + Math.cos(a) * (R - 16)} y2={76 + Math.sin(a) * (R - 16)} stroke="#2E3F4B" strokeWidth="1" />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="readout text-[30px] leading-none" style={{ color: tone }}><Counter to={days} duration={1.3} delay={0.5} /></span>
        <span className="console mt-1.5 max-w-[86px] text-center text-[7px] leading-tight text-dim2">{lapsed ? "days past the deadline" : "days remaining"}</span>
      </div>
    </div>
  );
}
