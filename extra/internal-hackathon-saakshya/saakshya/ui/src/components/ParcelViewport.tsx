import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ParcelFrame } from "./ParcelFrame";
import { parcelRing } from "../engine/data";
import { SENSOR_LABEL, SENSOR_RES } from "../engine/kaal";
import type { Cover, Palette } from "../lib/parcelRenderer";
import type { Claim, Frame, KaalResult } from "../engine/types";

/** The claim boundary, normalised into the viewport. */
function useRing(claim: Claim, aspect: number) {
  return useMemo(() => {
    const ring = parcelRing(claim);
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sp = Math.max(x1 - x0, y1 - y0) / 0.52;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return ring.map(([x, y]) => [50 + ((x - cx) / sp / aspect) * 100, 50 - ((y - cy) / sp) * 100] as const);
  }, [claim, aspect]);
}

/* The frame is centre-cropped to the viewport aspect, so a point read out of
   the square render has to be mapped into what is actually on screen. */
function toViewport(pt: [number, number], aspect: number): [number, number] | null {
  const lo = 0.5 - 0.5 / aspect;
  const y = (pt[1] - lo) * aspect;
  if (y < 0.06 || y > 0.94) return null;
  return [pt[0] * 100, y * 100];
}

/* An analyst's markup: ring the feature, run a leader out to a label.
   Rendered as HTML, not inside the SVG — the overlay SVG is stretched to the
   viewport aspect and would stretch the type with it. */
function Mark({
  at, label, note, tone, delay,
}: { at: [number, number]; label: string; note?: string; tone: string; delay: number }) {
  const right = at[0] < 58;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.86 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-none absolute z-20 flex items-center"
      style={{
        left: `${at[0]}%`, top: `${at[1]}%`,
        transform: `translate(${right ? "0" : "-100%"}, -50%)`,
        flexDirection: right ? "row" : "row-reverse",
      }}
    >
      <span className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
        style={{ boxShadow: `inset 0 0 0 1.2px ${tone}, 0 0 0 1px rgba(7,9,12,0.55)`, marginInline: right ? "-17px 0" : "0 -17px" }}>
        <span className="h-[3px] w-[3px] rounded-full" style={{ background: tone }} />
      </span>
      <span className="h-px w-7 shrink-0" style={{ background: tone, opacity: 0.7 }} />
      <span className={`flex flex-col ${right ? "items-start" : "items-end"}`}>
        <span className="console rounded-[1px] bg-void/85 px-1.5 py-[3px] text-[7.5px] whitespace-nowrap backdrop-blur-sm"
          style={{ color: tone, boxShadow: `inset 0 0 0 1px ${tone}55` }}>
          {label}
        </span>
        {note && (
          <span className="readout mt-[3px] rounded-[1px] bg-void/70 px-1.5 py-[1px] text-[8px] whitespace-nowrap text-halide/75 backdrop-blur-sm">
            {note}
          </span>
        )}
      </span>
    </motion.div>
  );
}

export function ParcelViewport({
  claim, kaal, frame, cover, palette, onPalette, className = "", aspect = 16 / 7.6,
}: {
  claim: Claim;
  kaal: KaalResult;
  frame: Frame;
  cover: Cover | null;
  palette: Palette;
  onPalette: (p: Palette) => void;
  className?: string;
  aspect?: number;
}) {
  const ring = useRing(claim, aspect);
  const d = ring.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("") + "Z";
  const mono = frame.sensor === "corona";

  const cleared = cover?.clearedAt ? toViewport(cover.clearedAt, aspect) : null;
  const canopy = cover?.canopyAt ? toViewport(cover.canopyAt, aspect) : null;
  const showCleared = !!cleared && (cover?.cultivated ?? 0) > 0.1;
  const showCanopy = !!canopy && (cover?.forest ?? 0) > 0.22;
  const markTone = mono ? "#F0E6CE" : palette === "infrared" ? "#FFE8B0" : "#EFE2B8";

  return (
    <div className={`relative overflow-hidden bg-[#0A0E12] ${className}`}>
      <ParcelFrame
        params={{
          seed: kaal.seed, canopy: frame.canopy, sensor: frame.sensor,
          trajectory: kaal.trajectory_class, year: frame.year, obs: frame.obs,
          detail: 1.7, palette,
        }}
      />
      <div className="scanlines pointer-events-none absolute inset-0 opacity-25" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-void/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-void/75 to-transparent" />

      {/* the claim boundary, traced over the frame */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
        <motion.path d={d} fill="none" stroke="rgba(7,9,12,0.72)" strokeWidth="0.9" vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} />
        <motion.path d={d} fill="rgba(245,239,226,0.05)" stroke="#F5EFE2" strokeWidth="0.32"
          strokeDasharray="1.6 1.2" vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} />
        {ring.slice(0, -1).map((p, i) => (
          <g key={i}>
            <rect x={p[0] - 0.85} y={p[1] - 0.85} width="1.7" height="1.7" fill="rgba(7,9,12,0.8)" />
            <rect x={p[0] - 0.5} y={p[1] - 0.5} width="1" height="1" fill="#F5EFE2" />
          </g>
        ))}
      </svg>

      {/* what an interpreter would ring on a print */}
      <AnimatePresence>
        {showCanopy && (
          <Mark key="canopy" at={canopy!} tone={markTone} delay={0.5}
            label="closed canopy" note={`${Math.round(cover!.forest * 100)}% of frame`} />
        )}
        {showCleared && (
          <Mark key="cleared" at={cleared!} tone={markTone} delay={0.62}
            label="cultivated"
            note={frame.year >= kaal.conversion_year ? `cleared c.${kaal.conversion_year}` : `${Math.round(cover!.cultivated * 100)}% of frame`} />
        )}
      </AnimatePresence>

      {/* film registration fiducials */}
      {[["top-2 left-2", "border-t border-l"], ["top-2 right-2", "border-t border-r"], ["bottom-2 left-2", "border-b border-l"], ["bottom-2 right-2", "border-b border-r"]].map(([pos, b]) => (
        <span key={pos} className={`pointer-events-none absolute ${pos} ${b} h-3.5 w-3.5 border-halide/45`} />
      ))}

      {/* what you are looking at */}
      <div className="pointer-events-none absolute top-4 left-4 space-y-1">
        <div className="console text-[8.5px] text-halide/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {SENSOR_LABEL[frame.sensor]}
        </div>
        <div className="readout text-[10px] text-halide/60 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {SENSOR_RES[frame.sensor]} · dry-season composite ·{" "}
          {mono ? "panchromatic film" : palette === "infrared" ? "false colour, bands 4-3-2" : "natural colour"}
        </div>
      </div>

      <div className="pointer-events-none absolute top-4 right-4 text-right">
        <div className="readout text-[30px] leading-none font-medium text-halide drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
          {frame.year}
        </div>
      </div>

      {/* scale + north */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex items-end gap-4">
        <div>
          <div className="flex h-[5px] w-[74px]">
            <span className="flex-1 bg-halide/85" /><span className="flex-1 bg-void/85" />
            <span className="flex-1 bg-halide/85" /><span className="flex-1 bg-void/85" />
          </div>
          <div className="readout mt-1 flex w-[74px] justify-between text-[8px] text-halide/70">
            <span>0</span><span>200 m</span>
          </div>
        </div>
        <svg width="16" height="26" viewBox="0 0 16 26" className="opacity-70">
          <path d="M8 1 12 12H4L8 1Z" fill="#F5EFE2" />
          <text x="8" y="24" fill="#F5EFE2" fontSize="8" fontFamily="Archivo" fontWeight="700" textAnchor="middle">N</text>
        </svg>
      </div>

      {/* how the bands are rendered — the one place the infrared story lives */}
      <div className="absolute right-4 bottom-4 flex flex-col items-end gap-1.5">
        {mono ? (
          <span className="console rounded-[2px] border border-line2 bg-void/80 px-2.5 py-1.5 text-[7.5px] text-dim backdrop-blur-sm">
            Film · no colour bands
          </span>
        ) : (
          <div className="flex overflow-hidden rounded-[2px] border border-line2 bg-void/80 backdrop-blur-sm">
            {(["natural", "infrared"] as const).map((k) => (
              <button key={k} onClick={() => onPalette(k)}
                className={`console px-2.5 py-1.5 text-[7.5px] transition-colors ${
                  palette === k ? "bg-halide text-void" : "text-dim hover:text-halide"
                }`}>
                {k === "natural" ? "Natural colour" : "Infrared"}
              </button>
            ))}
          </div>
        )}
        <AnimatePresence>
          {palette === "infrared" && !mono && (
            <motion.span
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="readout max-w-[280px] rounded-[2px] bg-void/80 px-2 py-1 text-right text-[8.5px] leading-relaxed text-halide/70 backdrop-blur-sm">
              Near-infrared puts live vegetation in red and worked soil in cyan — it separates crop vigour
              better than the eye can.
            </motion.span>
          )}
        </AnimatePresence>
        <span className="console max-w-[260px] text-right text-[7px] leading-relaxed text-halide/40">
          Simulated archive frame — a reconstruction of the Earth Engine output, not a distributed scene
        </span>
      </div>
    </div>
  );
}
