import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Shell } from "../components/Shell";
import { AtlasMap, type AtlasFilters, type Basemap } from "../components/AtlasMap";
import { ParcelFrame } from "../components/ParcelFrame";
import { Counter, Eyebrow } from "../components/Instruments";
import { IconArrow, IconLayers, IconX } from "../components/Icons";
import {
  CLAIMS, CONFLICTS, DISTRICT_STATS, claimById, conflictFor, evidenceStrength,
  kaalFor, nyayaFor, villageName,
} from "../engine/data";
import { REASONS, VERDICT_UI } from "../engine/nyaya";
import { STATUS_COLOR, STATUS_LABEL, TONE_COLOR, fmtDate } from "../lib/ui";

const DEFAULTS: AtlasFilters = {
  status: { granted: true, pending: true, rejected: true },
  types: { IFR: true, CR: true, CFR: true },
  conflicts: false,
  strength: false,
  parcels: false,
};

export default function Atlas() {
  const [filters, setFilters] = useState<AtlasFilters>(DEFAULTS);
  const [basemap, setBasemap] = useState<Basemap>("imagery");
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState(typeof window === "undefined" || window.innerWidth >= 1024);

  const shown = useMemo(
    () => CLAIMS.filter((c) => filters.status[c.status] && filters.types[c.claim_type]),
    [filters],
  );

  return (
    <Shell claimId={selected ?? undefined}>
      <div className="relative h-full w-full">
        <AtlasMap filters={filters} basemap={basemap} selected={selected} onSelect={setSelected} />

        {/* ── controls ─────────────────────────────────────────────── */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-start gap-3">
            <AnimatePresence initial={false}>
              {panel ? (
                <motion.div
                  key="panel"
                  initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-auto w-[268px] rounded-[3px] border border-line bg-deck/92 backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <Eyebrow>Layers</Eyebrow>
                    <button onClick={() => setPanel(false)} className="text-dim2 hover:text-halide" aria-label="Hide the layer panel">
                      <IconX size={13} />
                    </button>
                  </div>

                  <Group title="Claim status">
                    {(["rejected", "pending", "granted"] as const).map((k) => (
                      <Toggle key={k} on={filters.status[k]} color={STATUS_COLOR[k]}
                        count={CLAIMS.filter((c) => c.status === k).length}
                        onClick={() => setFilters((f) => ({ ...f, status: { ...f.status, [k]: !f.status[k] } }))}>
                        {STATUS_LABEL[k]}
                      </Toggle>
                    ))}
                  </Group>

                  <Group title="Right claimed">
                    {(["IFR", "CR", "CFR"] as const).map((k) => (
                      <Toggle key={k} on={filters.types[k]} color="#8B9AA3"
                        count={CLAIMS.filter((c) => c.claim_type === k).length}
                        onClick={() => setFilters((f) => ({ ...f, types: { ...f.types, [k]: !f.types[k] } }))}>
                        {k === "IFR" ? "Individual (IFR)" : k === "CR" ? "Community (CR)" : "Community forest (CFR)"}
                      </Toggle>
                    ))}
                  </Group>

                  <Group title="Analysis overlays">
                    <Toggle on={filters.strength} color="#7FD4D9" onClick={() => setFilters((f) => ({ ...f, strength: !f.strength }))}>
                      Evidence strength
                    </Toggle>
                    <Toggle on={filters.conflicts} color="#E8446B" count={CONFLICTS.length}
                      onClick={() => setFilters((f) => ({ ...f, conflicts: !f.conflicts }))}>
                      Boundary conflicts
                    </Toggle>
                    <Toggle on={filters.parcels} color="#8B9AA3" onClick={() => setFilters((f) => ({ ...f, parcels: !f.parcels }))}>
                      Parcel boundaries
                    </Toggle>
                  </Group>

                  <AnimatePresence>
                    {filters.strength && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-line">
                        <div className="px-4 py-3">
                          <div className="h-[6px] rounded-[1px]" style={{ background: "linear-gradient(90deg,#3A2430,#8C3350,#E8446B,#F08A6A,#7FD4D9)" }} />
                          <div className="readout mt-1.5 flex justify-between text-[8px] text-dim2"><span>weak</span><span>strong</span></div>
                          <p className="mt-2 text-[10.5px] leading-relaxed text-dim2">
                            Strength combines archive confidence with whether the finding actually answers the
                            recorded ground for refusal.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex border-t border-line">
                    {(["terrain", "imagery"] as const).map((b) => (
                      <button key={b} onClick={() => setBasemap(b)}
                        className={`console flex-1 border-r border-line py-2.5 text-[8px] last:border-r-0 transition-colors ${
                          basemap === b ? "bg-deckh text-halide" : "text-dim2 hover:text-dim"
                        }`}>
                        {b === "terrain" ? "Base map" : "Satellite"}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.button key="open" onClick={() => setPanel(true)}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="pointer-events-auto flex items-center gap-2 rounded-[3px] border border-line bg-deck/92 px-3 py-2.5 text-dim backdrop-blur-xl hover:text-halide">
                  <IconLayers size={14} /><span className="console text-[8.5px]">Layers</span>
                </motion.button>
              )}
            </AnimatePresence>

            <div className="pointer-events-auto ml-auto hidden max-w-[300px] rounded-[3px] border border-line bg-deck/92 px-4 py-3 backdrop-blur-xl lg:block">
              <Eyebrow tone="#E8446B">Read the map</Eyebrow>
              <p className="mt-2 text-[11.5px] leading-relaxed text-dim">
                Every dot is one claim under the Forest Rights Act. The carmine ones were refused —
                click any of them to see what the satellite archive holds for that ground.
              </p>
            </div>
          </div>

          {/* ── district readout ─────────────────────────────────────── */}
          <div className="pointer-events-auto flex items-end gap-px overflow-x-auto rounded-[3px] border border-line bg-deck/92 backdrop-blur-xl">
            <Stat label="Claims in view" value={shown.length} tone="#F5EFE2" />
            <Stat label="Refused" value={DISTRICT_STATS.rejected} tone="#E8446B" />
            <Stat label="Archive answers the ground" value={DISTRICT_STATS.recoverable} tone="#4FA86B" />
            <Stat label="Appeal window closed" value={DISTRICT_STATS.lapsed} tone="#D0873E" />
            <Stat label="Hectares under refusal" value={DISTRICT_STATS.recoverableHa} tone="#7FD4D9" suffix=" ha" />
            <div className="flex-1" />
            <Link to="/district" className="group flex items-center gap-2 self-stretch border-l border-line px-5 text-dim transition-colors hover:bg-deckh hover:text-halide">
              <span className="console text-[8.5px]">District view</span>
              <IconArrow size={14} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* ── the drawer ───────────────────────────────────────────── */}
        <AnimatePresence>
          {selected && <Drawer id={selected} onClose={() => setSelected(null)} />}
        </AnimatePresence>
      </div>
    </Shell>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line px-4 py-3 first:border-t-0">
      <div className="console mb-2 text-[7.5px] text-dim2">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Toggle({ on, color, count, onClick, children }: {
  on: boolean; color: string; count?: number; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="group flex w-full items-center gap-2.5 rounded-[2px] py-1.5 text-left transition-colors hover:bg-deckr">
      <span className="relative flex h-3 w-3 shrink-0 items-center justify-center rounded-[1px] border transition-colors"
        style={{ borderColor: on ? color : "#2E3F4B", background: on ? color : "transparent" }}>
        {on && <svg width="8" height="8" viewBox="0 0 10 10"><path d="M1.5 5 4 7.5 8.5 2" stroke="#07090C" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>}
      </span>
      <span className={`flex-1 text-[12px] transition-colors ${on ? "text-halide" : "text-dim2"}`}>{children}</span>
      {count !== undefined && <span className="readout text-[10px] text-dim2">{count}</span>}
    </button>
  );
}

function Stat({ label, value, tone, suffix = "" }: { label: string; value: number; tone: string; suffix?: string }) {
  return (
    <div className="min-w-[132px] shrink-0 border-r border-line px-5 py-3">
      <div className="console text-[7.5px] text-dim2">{label}</div>
      <div className="readout text-[26px] leading-none" style={{ color: tone }}>
        <Counter to={value} duration={1.2} suffix={suffix} />
      </div>
    </div>
  );
}

function Drawer({ id, onClose }: { id: string; onClose: () => void }) {
  const claim = claimById.get(id)!;
  const kaal = kaalFor(id);
  const nyaya = nyayaFor(id);
  const conflict = conflictFor(id);
  const strength = evidenceStrength(id);
  const now = kaal.frames[kaal.frames.length - 1];
  const before = kaal.frames.find((f) => f.year === Math.max(1967, kaal.conversion_year - 6))!;
  const v = nyaya ? VERDICT_UI[nyaya.verdict] : null;

  return (
    <motion.aside
      initial={{ x: 400, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 400, opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="absolute top-0 right-0 z-20 flex h-full w-full max-w-[392px] flex-col border-l border-line bg-deck/96 backdrop-blur-xl"
    >
      <div className="flex items-start justify-between border-b border-line px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[claim.status] }} />
            <span className="console text-[8px] text-dim2">{STATUS_LABEL[claim.status]} · {claim.claim_type}</span>
          </div>
          <h3 className="readout mt-1.5 text-[19px] text-halide">{claim.claim_id}</h3>
          <p className="mt-0.5 text-[12px] text-dim">
            {villageName(claim.village_lgd)} · {claim.area_ha} ha · {claim.claimant_category}
          </p>
        </div>
        <button onClick={onClose} className="mt-1 text-dim2 hover:text-halide" aria-label="Close"><IconX size={15} /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* then and now */}
        <div className="grid grid-cols-2 gap-px bg-line">
          {[before, now].map((f, i) => (
            <div key={i} className="relative aspect-[4/3] bg-deck">
              <ParcelFrame params={{ seed: kaal.seed, canopy: f.canopy, sensor: f.sensor, trajectory: kaal.trajectory_class, year: f.year, obs: f.obs, res: 384, detail: 1.4 }} />
              <div className="scanlines pointer-events-none absolute inset-0 opacity-25" />
              <span className="readout absolute bottom-1.5 left-2 text-[11px] text-halide drop-shadow-[0_1px_3px_#000]">{f.year}</span>
            </div>
          ))}
        </div>

        {claim.rejection_order && nyaya ? (
          <>
            <div className="border-b border-line px-5 py-4">
              <div className="console text-[7.5px] text-dim2">Ground recorded for refusal</div>
              <p className="mt-1.5 text-[13.5px] leading-snug text-halide">{REASONS[nyaya.reason].label}</p>
              <p className="record mt-2 text-[12.5px] leading-relaxed text-dim italic">“{claim.rejection_order.raw_text}”</p>
              <div className="console mt-2 text-[7.5px] text-dim2">
                {claim.rejection_order.rejecting_body} · {fmtDate(claim.rejection_order.order_date)}
              </div>
            </div>

            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_COLOR[v!.tone] }} />
                <span className="console text-[8px]" style={{ color: TONE_COLOR[v!.tone] }}>{v!.label}</span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-dim">{nyaya.finding}</p>
            </div>

            <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
              <Cell label="Break year" value={String(kaal.conversion_year)} tone="#7FD4D9" />
              <Cell label="Confidence" value={kaal.confidence.toFixed(2)} tone="#F5EFE2" />
              <Cell label="Strength" value={strength.toFixed(2)} tone={TONE_COLOR[v!.tone]} />
            </div>

            {conflict && (
              <div className="border-b border-line px-5 py-4">
                <Eyebrow tone="#E8446B">Boundary conflict</Eyebrow>
                <p className="mt-2 text-[12.5px] leading-relaxed text-dim">
                  {conflict.overlap_ha} ha of overlap detected against{" "}
                  <span className="readout text-halide">{conflict.a === id ? conflict.b : conflict.a}</span>
                  {conflict.kind === "claim-forest" ? " and the notified compartment boundary." : "."}
                </p>
              </div>
            )}

            <div className="px-5 py-4">
              <div className="console mb-2 text-[7.5px] text-dim2">Next step</div>
              <p className="text-[12.5px] leading-relaxed text-halide">{nyaya.nextAction}</p>
              {nyaya.deadline && (
                <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                  <span className="console text-[7.5px] text-dim2">Appeal to {nyaya.forum}</span>
                  <span className="readout text-[12px]" style={{ color: nyaya.window === "LAPSED" ? "#E8446B" : "#4FA86B" }}>
                    {nyaya.window === "LAPSED" ? `closed ${Math.abs(nyaya.daysLeft!)} d ago` : `${nyaya.daysLeft} d left`}
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="px-5 py-5">
            <p className="text-[13px] leading-relaxed text-dim">
              This claim is {claim.status}. The archive read is available for the record, and feeds the
              village continuity profile.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
        <Link to={`/claim/${id}`} className="group flex items-center justify-center gap-2 bg-carmine py-3.5 text-void transition-colors hover:bg-[#F05A7E]">
          <span className="console text-[8.5px]">Open the archive</span>
          <IconArrow size={14} className="transition-transform group-hover:translate-x-1" />
        </Link>
        <Link to={`/decision/${id}`} className="flex items-center justify-center bg-deckr py-3.5 text-halide transition-colors hover:bg-deckh">
          <span className="console text-[8.5px]">Appeal route</span>
        </Link>
      </div>
    </motion.aside>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="px-4 py-3">
      <div className="console text-[7px] text-dim2">{label}</div>
      <div className="readout mt-0.5 text-[17px]" style={{ color: tone }}>{value}</div>
    </div>
  );
}

