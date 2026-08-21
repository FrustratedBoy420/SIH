import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Shell } from "../components/Shell";
import { Counter, Eyebrow } from "../components/Instruments";
import { IconArrow } from "../components/Icons";
import {
  CLAIMS, DISTRICT, DISTRICT_STATS, PROFILES, evidenceStrength, isRecoverable, kaalFor, nyayaFor, villageName,
} from "../engine/data";
import { REASONS, VERDICT_UI } from "../engine/nyaya";
import { TONE_COLOR, fmtDate } from "../lib/ui";
import type { ReasonCategory } from "../engine/types";

type Sort = "strength" | "deadline" | "area";

export default function District() {
  const [sort, setSort] = useState<Sort>("strength");
  const [reason, setReason] = useState<ReasonCategory | "all">("all");

  const rejected = useMemo(() => CLAIMS.filter((c) => c.status === "rejected"), []);
  const reasonCounts = useMemo(() => {
    const m = new Map<ReasonCategory, { total: number; answered: number }>();
    for (const c of rejected) {
      const k = c.rejection_order!.reason_category;
      const e = m.get(k) ?? { total: 0, answered: 0 };
      e.total++;
      if (isRecoverable(c.claim_id)) e.answered++;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [rejected]);

  const queue = useMemo(() => {
    const rows = rejected
      .filter((c) => reason === "all" || c.rejection_order!.reason_category === reason)
      .map((c) => ({ claim: c, n: nyayaFor(c.claim_id)!, k: kaalFor(c.claim_id), s: evidenceStrength(c.claim_id) }));
    if (sort === "strength") rows.sort((a, b) => b.s - a.s);
    if (sort === "area") rows.sort((a, b) => b.claim.area_ha - a.claim.area_ha);
    if (sort === "deadline") rows.sort((a, b) => (a.n.daysLeft ?? 9e9) - (b.n.daysLeft ?? 9e9));
    return rows;
  }, [rejected, sort, reason]);

  const maxReason = Math.max(...reasonCounts.map(([, v]) => v.total));

  return (
    <Shell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1500px] px-6 pt-6 pb-20 lg:px-10">
          <Eyebrow>District Tribal Welfare · monitoring</Eyebrow>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-6">
            <h1 className="display-xl text-[58px] text-halide">
              {DISTRICT.name}
              <span className="record ml-4 align-middle text-[19px] font-normal tracking-normal text-dim2 italic">{DISTRICT.state}</span>
            </h1>
            <Link to="/atlas" className="group flex items-center gap-2 rounded-[2px] border border-line2 px-4 py-2.5 text-dim transition-colors hover:border-halide hover:text-halide">
              <span className="console text-[8.5px]">Open the atlas</span>
              <IconArrow size={14} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          {/* ── the numbers ─────────────────────────────────────────── */}
          <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Claims on record" value={DISTRICT_STATS.total} tone="#F5EFE2" />
            <Kpi label="Recognised" value={DISTRICT_STATS.granted} tone="#4FA86B" />
            <Kpi label="Pending" value={DISTRICT_STATS.pending} tone="#6E8BA8" />
            <Kpi label="Refused" value={DISTRICT_STATS.rejected} tone="#E8446B" />
            <Kpi label="Archive answers the ground" value={DISTRICT_STATS.recoverable} tone="#4FA86B"
              foot={`${Math.round((DISTRICT_STATS.recoverable / DISTRICT_STATS.rejected) * 100)}% of refusals`} />
            <Kpi label="Appeal window closed" value={DISTRICT_STATS.lapsed} tone="#D9A441"
              foot="condonation or fresh claim" />
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
            {/* ── why claims fail here ────────────────────────────── */}
            <div className="rounded-[3px] border border-line bg-deck">
              <div className="border-b border-line px-5 py-4">
                <Eyebrow>Grounds recorded for refusal</Eyebrow>
                <p className="mt-2 text-[11.5px] leading-relaxed text-dim2">
                  The filled part of each bar is what the archive can speak to. The rest needs documents,
                  procedure or eligibility work — not imagery.
                </p>
              </div>
              <div className="space-y-4 px-5 py-5">
                {reasonCounts.map(([k, val], i) => (
                  <button key={k} onClick={() => setReason(reason === k ? "all" : k)} className="block w-full text-left">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`text-[12.5px] transition-colors ${reason === k ? "text-halide" : "text-dim"}`}>
                        {REASONS[k].short}
                      </span>
                      <span className="readout shrink-0 text-[11px] text-dim2">{val.answered}/{val.total}</span>
                    </div>
                    <div className="relative mt-1.5 h-[7px] bg-line">
                      <motion.div className="absolute inset-y-0 left-0 w-full bg-carmine/35"
                        initial={{ scaleX: 0 }} animate={{ scaleX: val.total / maxReason }} style={{ originX: 0 }}
                        transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: [0.16, 1, 0.3, 1] }} />
                      <motion.div className="absolute inset-y-0 left-0 w-full bg-brass"
                        initial={{ scaleX: 0 }} animate={{ scaleX: val.answered / maxReason }} style={{ originX: 0 }}
                        transition={{ duration: 0.8, delay: 0.35 + i * 0.08, ease: [0.16, 1, 0.3, 1] }} />
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 border-t border-line px-5 py-3">
                <Legend color="#D9A441">archive speaks to it</Legend>
                <Legend color="rgba(232,68,107,0.5)">it does not</Legend>
              </div>

              {/* villages by priority */}
              <div className="border-t border-line px-5 py-4">
                <Eyebrow>Villages by development priority</Eyebrow>
                <div className="mt-3 space-y-px">
                  {PROFILES.map((p, i) => (
                    <Link key={p.lgd_code} to={`/village/${p.lgd_code}`}
                      className="group flex items-center gap-3 rounded-[2px] px-2 py-2 transition-colors hover:bg-deckr">
                      <span className="readout w-5 text-[10px] text-dim2">{i + 1}</span>
                      <span className="flex-1 text-[12.5px] text-halide">{p.name}</span>
                      <span className="h-[3px] w-16 bg-line">
                        <motion.span className="block h-full"
                          style={{ originX: 0, background: p.priorityBand === "critical" ? "#E8446B" : p.priorityBand === "high" ? "#D9A441" : "#8B9AA3" }}
                          initial={{ scaleX: 0 }} animate={{ scaleX: p.priority }}
                          transition={{ duration: 0.7, delay: 0.4 + i * 0.05 }} />
                      </span>
                      <span className="readout w-9 text-right text-[10.5px] text-dim">{p.priority.toFixed(2)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* ── the queue ──────────────────────────────────────── */}
            <div className="rounded-[3px] border border-line bg-deck">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <Eyebrow>Recovery queue</Eyebrow>
                  <p className="mt-1.5 text-[11.5px] text-dim2">
                    {queue.length} refused claims{reason !== "all" && ` on the ground “${REASONS[reason].short}”`}
                    {reason !== "all" && (
                      <button onClick={() => setReason("all")} className="console ml-2 text-[7.5px] text-brass">clear</button>
                    )}
                  </p>
                </div>
                <div className="flex gap-px overflow-hidden rounded-[2px] border border-line2">
                  {(["strength", "deadline", "area"] as const).map((s) => (
                    <button key={s} onClick={() => setSort(s)}
                      className={`console px-3 py-1.5 text-[7.5px] transition-colors ${sort === s ? "bg-deckh text-halide" : "text-dim2 hover:text-dim"}`}>
                      {s === "strength" ? "By evidence" : s === "deadline" ? "By deadline" : "By area"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[104px_minmax(0,1fr)_72px_128px_88px_96px] gap-3 border-b border-line px-5 py-2.5">
                {["Claim", "Village and ground", "Break", "Evidence strength", "Area", "Window"].map((h) => (
                  <span key={h} className="console text-[7px] text-dim2">{h}</span>
                ))}
              </div>

              <div className="max-h-[560px] divide-y divide-line overflow-y-auto">
                {queue.map((r, i) => {
                  const v = VERDICT_UI[r.n.verdict];
                  const tone = TONE_COLOR[v.tone];
                  return (
                    <motion.div key={r.claim.claim_id}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.32, delay: Math.min(0.5, i * 0.018) }}>
                      <Link to={`/claim/${r.claim.claim_id}`}
                        className="group grid grid-cols-[104px_minmax(0,1fr)_72px_128px_88px_96px] items-center gap-3 px-5 py-3 transition-colors hover:bg-deckr">
                        <span className="readout text-[11px] text-halide">{r.claim.claim_id.slice(4)}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] text-halide">{villageName(r.claim.village_lgd)}</span>
                          <span className="block truncate text-[11px] text-dim2">
                            {REASONS[r.n.reason].short} · {r.claim.claim_type} · {r.claim.claimant_category}
                          </span>
                        </span>
                        <span className="readout text-[11.5px]" style={{ color: r.k.conversion_year < 2005 ? "#7FD4D9" : "#5D6D77" }}>
                          {r.k.conversion_year}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="h-[4px] flex-1 bg-line">
                            <motion.span className="block h-full" style={{ originX: 0, background: tone }}
                              initial={{ scaleX: 0 }} animate={{ scaleX: r.s }}
                              transition={{ duration: 0.6, delay: Math.min(0.6, 0.1 + i * 0.018) }} />
                          </span>
                          <span className="readout w-8 text-[10.5px] text-dim">{r.s.toFixed(2)}</span>
                        </span>
                        <span className="readout text-[11px] text-dim">{r.claim.area_ha} ha</span>
                        <span className="readout text-[10.5px]"
                          style={{ color: r.n.window === "LAPSED" ? "#E8446B" : r.n.window === "OPEN" ? "#4FA86B" : "#5D6D77" }}>
                          {r.n.daysLeft === null ? "no window" : r.n.window === "LAPSED" ? `−${Math.abs(r.n.daysLeft)} d` : `${r.n.daysLeft} d`}
                          <span className="console block text-[6.5px] text-dim2">
                            {r.n.deadline ? fmtDate(r.n.deadline) : "beyond the ladder"}
                          </span>
                        </span>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="mt-8 max-w-[92ch] border-t border-line pt-5 text-[11.5px] leading-relaxed text-dim2">
            Ranking orders work; it does not decide claims. Every row opens the archive read behind it, and an
            officer can disagree with the finding on the record.
          </p>
        </div>
      </div>
    </Shell>
  );
}

function Kpi({ label, value, tone, foot }: { label: string; value: number; tone: string; foot?: string }) {
  return (
    <div className="bg-deck px-5 py-4">
      <div className="console text-[7.5px] text-dim2">{label}</div>
      <div className="readout mt-1 text-[34px] leading-none" style={{ color: tone }}><Counter to={value} duration={1.3} /></div>
      {foot && <div className="mt-1.5 text-[10.5px] text-dim2">{foot}</div>}
    </div>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-[7px] w-[7px]" style={{ background: color }} />
      <span className="console text-[7px] text-dim2">{children}</span>
    </span>
  );
}
