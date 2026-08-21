import { motion } from "motion/react";
import { COVER_CLASSES, type Cover, type Palette } from "../lib/parcelRenderer";

/* What is actually in the frame you are looking at, said in words and in
   proportion. It moves with the Chronoscope, so scrubbing the years is also
   watching the canopy figure fall and the cultivated figure rise. */

const KEYS = ["forest", "cultivated", "homestead", "water"] as const;

export function CoverBar({
  cover, baseline, palette, baselineYear,
}: {
  cover: Cover | null;
  baseline: Cover | null;
  palette: Palette;
  baselineYear: number;
}) {
  if (!cover) return null;
  const colour = (i: number) => (palette === "infrared" ? COVER_CLASSES[i].infrared : COVER_CLASSES[i].natural);
  const delta = baseline ? cover.cultivated - baseline.cultivated : 0;
  const shown = KEYS.map((k, i) => ({ k, i, v: cover[k] })).filter((c) => c.v > 0.004);

  return (
    <div className="flex items-center gap-4 rounded-[3px] border border-line bg-deck px-4 py-2.5">
      <span className="console shrink-0 text-[7.5px] text-dim2">Ground cover</span>

      <div className="flex h-[9px] w-[170px] shrink-0 overflow-hidden rounded-[1px] bg-line">
        {shown.map((c) => (
          <motion.div
            key={c.k}
            animate={{ width: `${c.v * 100}%` }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            style={{ background: colour(c.i) }}
            className="h-full shrink-0"
          />
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
        {KEYS.map((k, i) => {
          const v = cover[k];
          const off = v <= 0.004;
          return (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-[9px] w-[9px] shrink-0 rounded-[1px] ring-1 ring-line2"
                style={{ background: off ? "transparent" : colour(i) }} />
              <span className={`text-[11.5px] whitespace-nowrap ${off ? "text-dim2/60" : "text-dim"}`}>
                {COVER_CLASSES[i].label}
              </span>
              <span className={`readout text-[11.5px] ${off ? "text-dim2/60" : "text-halide"}`}>
                {off ? "—" : `${Math.round(v * 100)}%`}
              </span>
            </span>
          );
        })}
      </div>

      {baseline && Math.abs(delta) > 0.02 && (
        <span className="readout shrink-0 text-[10.5px]" style={{ color: delta > 0 ? "#B0A070" : "#4FA86B" }}>
          {delta > 0 ? "+" : "−"}{Math.abs(Math.round(delta * 100))} points cultivated since {baselineYear}
        </span>
      )}
    </div>
  );
}
