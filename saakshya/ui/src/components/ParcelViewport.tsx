import { useMemo } from "react";
import { motion } from "motion/react";
import { ParcelFrame } from "./ParcelFrame";
import { parcelRing } from "../engine/data";
import { SENSOR_LABEL, SENSOR_RES } from "../engine/kaal";
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

export function ParcelViewport({
  claim, kaal, frame, className = "", aspect = 16 / 7.6,
}: { claim: Claim; kaal: KaalResult; frame: Frame; className?: string; aspect?: number }) {
  const ring = useRing(claim, aspect);
  const d = ring.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("") + "Z";

  return (
    <div className={`relative overflow-hidden bg-[#0A0E12] ${className}`}>
      <ParcelFrame
        params={{ seed: kaal.seed, canopy: frame.canopy, sensor: frame.sensor, trajectory: kaal.trajectory_class, year: frame.year, obs: frame.obs, detail: 1.7 }}
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
          {SENSOR_RES[frame.sensor]} · dry-season composite · false colour 4-3-2
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

      <div className="pointer-events-none absolute top-[54px] right-4 max-w-[30%] text-right">
        <div className="console text-[7px] leading-relaxed text-halide/40">
          Simulated archive frame — a reconstruction of the Earth Engine output, not a distributed scene
        </div>
      </div>
    </div>
  );
}
