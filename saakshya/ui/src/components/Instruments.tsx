import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, animate } from "motion/react";

/* ── Odometer ────────────────────────────────────────────────────────── */
export function Counter({
  to, decimals = 0, duration = 1.4, delay = 0, prefix = "", suffix = "", className = "",
}: { to: number; decimals?: number; duration?: number; delay?: number; prefix?: string; suffix?: string; className?: string }) {
  const [out, setOut] = useState(prefix + (0).toFixed(decimals) + suffix);
  useEffect(() => {
    const mv = { v: 0 };
    const c = animate(0, to, {
      duration, delay, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { mv.v = v; setOut(prefix + v.toFixed(decimals) + suffix); },
    });
    return () => c.stop();
  }, [to, duration, delay, decimals, prefix, suffix]);
  return <span className={className}>{out}</span>;
}

/* ── Confidence dial ─────────────────────────────────────────────────
   A 260° instrument face. The number is never shown without its drivers —
   an unexplained confidence score is worse than none.                     */
export function ConfidenceDial({ value, size = 168, label = "Evidence confidence" }: { value: number; size?: number; label?: string }) {
  const R = 62, CX = 80, CY = 80;
  const SWEEP = 260, START = 140;
  const mv = useMotionValue(0);
  const sp = useSpring(mv, { stiffness: 60, damping: 18 });
  useEffect(() => { const t = setTimeout(() => mv.set(value), 260); return () => clearTimeout(t); }, [value, mv]);

  const circ = 2 * Math.PI * R;
  const dash = useTransform(sp, (v) => `${(v * SWEEP / 360) * circ} ${circ}`);
  const needle = useTransform(sp, (v) => START + v * SWEEP);
  const tone = value >= 0.75 ? "#4FA86B" : value >= 0.55 ? "#D0873E" : "#E8446B";

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size * 0.86 }}>
        <svg viewBox="0 0 160 148" className="absolute inset-0 h-full w-full overflow-visible">
          <g transform={`rotate(${START} ${CX} ${CY})`}>
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="#22303A" strokeWidth="9"
              strokeDasharray={`${(SWEEP / 360) * circ} ${circ}`} strokeLinecap="butt" />
            <motion.circle cx={CX} cy={CY} r={R} fill="none" stroke={tone} strokeWidth="9"
              style={{ strokeDasharray: dash }} strokeLinecap="butt" />
          </g>
          {/* graduations */}
          {Array.from({ length: 21 }).map((_, i) => {
            const a = ((START + (i / 20) * SWEEP) * Math.PI) / 180;
            const maj = i % 5 === 0;
            const r1 = R - 7, r2 = R - (maj ? 15 : 11);
            return (
              <line key={i}
                x1={CX + Math.cos(a) * r1} y1={CY + Math.sin(a) * r1}
                x2={CX + Math.cos(a) * r2} y2={CY + Math.sin(a) * r2}
                stroke={maj ? "#5D6D77" : "#2E3F4B"} strokeWidth={maj ? 1.3 : 0.8} />
            );
          })}
          <motion.g style={{ rotate: needle, originX: `${CX}px`, originY: `${CY}px` }}>
            <line x1={CX} y1={CY} x2={CX + R - 4} y2={CY} stroke="#F5EFE2" strokeWidth="1.6" />
            <circle cx={CX + R - 4} cy={CY} r="2.6" fill="#F5EFE2" />
          </motion.g>
          <circle cx={CX} cy={CY} r="4" fill="#0E1419" stroke="#5D6D77" strokeWidth="1.2" />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-[42%] text-center">
          <div className="readout text-[40px] leading-none font-medium" style={{ color: tone }}>
            <Counter to={value} decimals={2} duration={1.6} />
          </div>
        </div>
      </div>
      <div className="console mt-1 text-center text-[8px] text-dim2">{label}</div>
    </div>
  );
}

/* ── Driver bars ─────────────────────────────────────────────────────── */
export function Driver({ label, value, note, delay = 0 }: { label: string; value: number; note: string; delay?: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 py-2.5">
      <div className="text-[12.5px] text-halide">{label}</div>
      <div className="readout text-[12px] text-dim">{note}</div>
      <div className="col-span-2 h-[3px] overflow-hidden bg-line">
        <motion.div className="h-full bg-dim"
          initial={{ scaleX: 0 }} whileInView={{ scaleX: Math.max(0.02, Math.min(1, value)) }}
          viewport={{ once: true }} transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
          style={{ originX: 0 }} />
      </div>
    </div>
  );
}

/* ── Rubber stamp ────────────────────────────────────────────────────
   Lands on the sheet with a rotate-and-scale overshoot.                  */
export function Stamp({
  lines, tone = "#B32B4D", rotate = -8, delay = 0.5, size = 1,
}: { lines: string[]; tone?: string; rotate?: number; delay?: number; size?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 2.4, rotate: rotate - 16 }}
      animate={{ opacity: 0.85, scale: 1, rotate }}
      transition={{ duration: 0.45, delay, ease: [0.34, 1.56, 0.64, 1] }}
      className="inline-block select-none"
      style={{ color: tone, fontSize: `${size}rem` }}
    >
      <div className="border-[2.5px] px-3 py-1.5 text-center" style={{ borderColor: "currentColor", borderRadius: 2 }}>
        {lines.map((l, i) => (
          <div key={i} className="console whitespace-nowrap leading-tight" style={{ fontSize: i === 0 ? "0.66em" : "0.5em", opacity: i === 0 ? 1 : 0.8, letterSpacing: "0.1em" }}>
            {l}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ── Eyebrow label ───────────────────────────────────────────────────── */
export function Eyebrow({ children, tone = "#5D6D77", className = "" }: { children: React.ReactNode; tone?: string; className?: string }) {
  return (
    <div className={`console flex items-center gap-2 text-[8.5px] ${className}`} style={{ color: tone }}>
      <span className="h-px w-4" style={{ background: tone }} />
      {children}
    </div>
  );
}
