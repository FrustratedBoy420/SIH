import { useMemo } from "react";
import { motion } from "motion/react";
import type { KaalResult } from "../engine/types";

/* Spectral trace: annual dry-season NDVI, with the LandTrendr segmented fit
   drawn over it. The fit is what the breakpoint date comes from — the raw
   series alone is too noisy to date anything, and showing both is the point. */

export function NdviTrace({
  kaal,
  year,
  onYear,
  height = 210,
}: {
  kaal: KaalResult;
  year: number;
  onYear?: (y: number) => void;
  height?: number;
}) {
  const W = 1000;
  const H = height;
  const padL = 34, padR = 14, padT = 14, padB = 26;
  const y0 = kaal.years[0];
  const y1 = kaal.years[kaal.years.length - 1];

  const X = (y: number) => padL + ((y - y0) / (y1 - y0)) * (W - padL - padR);
  const Y = (v: number) => padT + (1 - v) * (H - padT - padB);

  const { rawPath, fitPath, area } = useMemo(() => {
    const pts = kaal.years.map((y, i) => [X(y), Y(kaal.ndvi[i])] as const);
    const raw = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");

    // the segmented fit: stable, transition, stable
    const conv = kaal.conversion_year;
    const trans = kaal.trajectory_class === "shifting_cultivation" ? 2 : 3;
    const pre = kaal.ndvi.filter((_, i) => kaal.years[i] < conv);
    const post = kaal.ndvi.filter((_, i) => kaal.years[i] >= conv + trans);
    const mPre = pre.reduce((a, b) => a + b, 0) / Math.max(1, pre.length);
    const mPost = post.reduce((a, b) => a + b, 0) / Math.max(1, post.length);
    const fit = [
      `M${X(y0)},${Y(mPre)}`,
      `L${X(conv)},${Y(mPre)}`,
      `L${X(conv + trans)},${Y(mPost)}`,
      `L${X(y1)},${Y(mPost)}`,
    ].join("");
    const ar = `${raw}L${X(y1)},${Y(0)}L${X(y0)},${Y(0)}Z`;
    return { rawPath: raw, fitPath: fit, area: ar };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaal, H]);

  const curIdx = Math.max(0, kaal.years.indexOf(year));
  const curV = kaal.ndvi[curIdx] ?? 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full cursor-ew-resize"
      style={{ height }}
      preserveAspectRatio="none"
      onPointerDown={(e) => {
        if (!onYear) return;
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const vbX = ((e.clientX - r.left) / r.width) * W;
        const yy = Math.round(y0 + ((vbX - padL) / (W - padL - padR)) * (y1 - y0));
        onYear(Math.max(y0, Math.min(y1, yy)));
      }}
    >
      <defs>
        <linearGradient id="ndviFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F2405C" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#F2405C" stopOpacity="0" />
        </linearGradient>
        <clipPath id="preCut"><rect x="0" y="0" width={X(2005)} height={H} /></clipPath>
      </defs>

      {/* gridlines at NDVI 0.25 / 0.50 / 0.75 */}
      {[0.25, 0.5, 0.75].map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={Y(v)} y2={Y(v)} stroke="#22303A" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <text x={4} y={Y(v) + 3} fill="#5D6D77" fontSize="9" fontFamily="IBM Plex Mono">{v.toFixed(2)}</text>
        </g>
      ))}

      {/* everything left of the cutoff is the part that matters */}
      <rect x={padL} y={padT} width={Math.max(0, X(2005) - padL)} height={H - padT - padB} fill="#E8446B" opacity="0.055" />

      <motion.path
        d={area} fill="url(#ndviFill)"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.5 }}
      />
      <motion.path
        d={rawPath} fill="none" stroke="#7A8F99" strokeWidth="1.1" vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
      />
      {/* raw observations, sized by how many scenes fed the composite */}
      {kaal.years.map((y, i) => (
        <motion.circle
          key={y} cx={X(y)} cy={Y(kaal.ndvi[i])} r={kaal.frames[i]?.obs < 6 ? 1.4 : 2.2}
          fill={kaal.frames[i]?.obs < 6 ? "#5D6D77" : "#9FB2BB"}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.4 + i * 0.008 }}
        />
      ))}
      <motion.path
        d={fitPath} fill="none" stroke="#F5EFE2" strokeWidth="2.2" vectorEffect="non-scaling-stroke"
        strokeLinejoin="round" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.9 }}
      />

      {/* the cutoff */}
      <line x1={X(2005)} x2={X(2005)} y1={padT - 6} y2={H - padB} stroke="#E8446B" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      <text x={X(2005) - 6} y={padT + 2} fill="#E8446B" fontSize="9.5" fontFamily="Archivo" fontWeight="600"
        letterSpacing="1.4" textAnchor="end" style={{ textTransform: "uppercase" }}>13 dec 2005</text>

      {/* the breakpoint */}
      <motion.g initial={{ opacity: 0, scaleY: 0.4 }} animate={{ opacity: 1, scaleY: 1 }}
        transition={{ duration: 0.5, delay: 2.25, ease: [0.34, 1.56, 0.64, 1] }} style={{ transformOrigin: `${X(kaal.conversion_year)}px ${H}px` }}>
        <line x1={X(kaal.conversion_year)} x2={X(kaal.conversion_year)} y1={padT - 6} y2={H - padB}
          stroke="#D9A441" strokeWidth="1.4" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <polygon points={`${X(kaal.conversion_year) - 5},${padT - 6} ${X(kaal.conversion_year) + 5},${padT - 6} ${X(kaal.conversion_year)},${padT + 2}`} fill="#D9A441" />
      </motion.g>

      {/* live readout, tied to the Chronoscope */}
      <g style={{ transform: `translateX(${X(year)}px)` }}>
        <line x1={0} x2={0} y1={padT - 6} y2={H - padB} stroke="#F5EFE2" strokeWidth="1" opacity="0.55" vectorEffect="non-scaling-stroke" />
        <circle cx={0} cy={Y(curV)} r="4.5" fill="#07090C" stroke="#F5EFE2" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </g>

      <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#2E3F4B" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <text x={padL} y={H - padB + 14} fill="#5D6D77" fontSize="9" fontFamily="IBM Plex Mono">{y0}</text>
      <text x={W - padR} y={H - padB + 14} fill="#5D6D77" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="end">{y1}</text>
    </svg>
  );
}
