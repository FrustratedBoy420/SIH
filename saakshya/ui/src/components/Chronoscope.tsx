import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { blitCover, renderParcel } from "../lib/parcelRenderer";
import { SENSOR_LABEL } from "../engine/kaal";
import type { Frame, KaalResult } from "../engine/types";

/* ────────────────────────────────────────────────────────────────────────
   THE CHRONOSCOPE
   The single instrument of this product. Fifty-eight years of archive laid
   out as one film strip, with the 13 December 2005 cutoff burned into it as
   a fiducial you physically drag across. Scrub it and the parcel image, the
   spectral trace and the verdict all move together.
   ──────────────────────────────────────────────────────────────────────── */

const ERAS = [
  { from: 1967, to: 1971, label: "Corona KH-4B", tint: "#8C7B5E" },
  { from: 1972, to: 1983, label: "Landsat MSS", tint: "#5B7480" },
  { from: 1984, to: 1998, label: "Landsat TM", tint: "#4E6B78" },
  { from: 1999, to: 2012, label: "Landsat ETM+", tint: "#57707C" },
  { from: 2013, to: 2016, label: "Landsat OLI", tint: "#5F818C" },
  { from: 2017, to: 2100, label: "Sentinel-2", tint: "#6E97A2" },
];

function Sprockets({ count }: { count: number }) {
  return (
    <div className="flex h-[9px] items-center justify-between px-[3px]" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="h-[5px] w-[7px] rounded-[1.5px] bg-void/85 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.06)]" />
      ))}
    </div>
  );
}

export function Chronoscope({
  kaal,
  year,
  onYear,
  height = 74,
  showTransport = true,
}: {
  kaal: KaalResult;
  year: number;
  onYear: (y: number) => void;
  height?: number;
  showTransport?: boolean;
}) {
  const frames = kaal.frames;
  const n = frames.length;
  const idx = Math.max(0, frames.findIndex((f) => f.year === year));
  const strip = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [head, setHead] = useState(idx); // fractional playhead, for smooth transport
  const [dragging, setDragging] = useState(false);
  const [developed, setDeveloped] = useState(0);

  const yearMin = frames[0].year;
  const yearMax = frames[n - 1].year;
  const xFor = useCallback((i: number) => ((i + 0.5) / n) * 100, [n]);

  /* The strip develops left to right, a few frames per animation frame, so
     the interface stays live while fifty-eight years are rendered. */
  useEffect(() => {
    const cv = strip.current;
    if (!cv) return;
    let raf = 0;
    let cancelled = false;

    const paint = () => {
      const r = cv.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0A0E12";
      ctx.fillRect(0, 0, cv.width, cv.height);
      const slot = cv.width / n;
      let i = 0;
      const chunk = () => {
        if (cancelled) return;
        const t0 = performance.now();
        while (i < n && performance.now() - t0 < 9) {
          const f = frames[i];
          const src = renderParcel({
            seed: kaal.seed, canopy: f.canopy, sensor: f.sensor,
            trajectory: kaal.trajectory_class, year: f.year, obs: f.obs, detail: 0.68, res: 176,
          });
          const x = Math.floor(i * slot);
          const w = Math.ceil(slot) + 1;
          if (src) blitCover(src, ctx, x, 0, w, cv.height);
          else { ctx.fillStyle = "#151D24"; ctx.fillRect(x, 0, w, cv.height); }
          ctx.fillStyle = "rgba(6,9,12,0.5)";
          ctx.fillRect(x, 0, 1, cv.height);
          i++;
        }
        setDeveloped(i / n);
        if (i < n) raf = requestAnimationFrame(chunk);
      };
      raf = requestAnimationFrame(chunk);
    };

    paint();
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); paint(); });
    ro.observe(cv);
    return () => { cancelled = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [frames, kaal.seed, kaal.trajectory_class, n]);

  /* transport */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let t0 = performance.now();
    const start = head >= n - 1 ? 0 : head;
    const dur = (n - start) * 175;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const h = start + k * (n - 1 - start);
      setHead(h);
      onYear(frames[Math.round(h)].year);
      if (k < 1) raf = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => { if (!playing && !dragging) setHead(idx); }, [idx, playing, dragging]);

  const seek = useCallback(
    (clientX: number) => {
      const el = box.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const k = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const i = Math.max(0, Math.min(n - 1, Math.round(k * n - 0.5)));
      setHead(i);
      onYear(frames[i].year);
    },
    [frames, n, onYear],
  );

  const cur: Frame = frames[Math.round(head)] ?? frames[idx];
  const cutoffX = useMemo(() => {
    const i = frames.findIndex((f) => f.year === 2005);
    return xFor(i);
  }, [frames, xFor]);
  const breakX = useMemo(() => {
    const i = frames.findIndex((f) => f.year === kaal.conversion_year);
    return i < 0 ? null : xFor(i);
  }, [frames, kaal.conversion_year, xFor]);

  const decades = frames.map((f, i) => ({ f, i })).filter(({ f }) => f.year % 10 === 0);
  const crossed = cur.year >= 2005;

  return (
    <div className="select-none">
      {/* transport + readout */}
      {showTransport && (
        <div className="mb-2.5 flex flex-wrap items-end gap-3">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="group flex h-9 items-center gap-2 rounded-[2px] border border-line2 bg-deckr px-3 text-halide transition-colors hover:border-carmine hover:bg-deckh"
            aria-label={playing ? "Pause the archive sweep" : "Sweep the archive"}
          >
            {playing ? (
              <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor"><rect width="3" height="10" /><rect x="6" width="3" height="10" /></svg>
            ) : (
              <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor"><path d="M0 0l9 5-9 5z" /></svg>
            )}
            <span className="console text-[9px]">{playing ? "Pause" : "Sweep archive"}</span>
          </button>

          <div className="flex items-baseline gap-2">
            <span className="readout text-[38px] leading-none font-medium text-halide tabular-nums">{cur.year}</span>
            <span className="console text-[8.5px] text-dim2">{SENSOR_LABEL[cur.sensor]}</span>
          </div>

          <div className="ml-auto hidden items-center gap-4 sm:flex">
            <div className="text-right">
              <div className="console text-[8px] text-dim2">Valid observations</div>
              <div className="readout text-[13px] text-dim">{cur.obs === 1 ? "single film frame" : `${cur.obs} scenes`}</div>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={crossed ? "after" : "before"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28 }}
                className={`rounded-[2px] border px-2.5 py-1.5 ${
                  crossed ? "border-line2 bg-deckr text-dim" : "border-carmine/50 bg-carmine/10 text-carmine"
                }`}
              >
                <div className="console text-[8px] leading-tight">{crossed ? "after the cutoff" : "before the cutoff"}</div>
                <div className="readout text-[11px] leading-tight">
                  {crossed ? `+${cur.year - 2005} yr` : `−${2005 - cur.year} yr`}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* the film */}
      <div
        ref={box}
        className="relative cursor-ew-resize rounded-[3px] bg-[#0A0E12] px-[3px] py-[1px] shadow-[0_0_0_1px_#22303A,0_16px_40px_-24px_#000]"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDragging(true); setPlaying(false); seek(e.clientX); }}
        onPointerMove={(e) => dragging && seek(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        role="slider"
        tabIndex={0}
        aria-label="Archive year"
        aria-valuemin={yearMin}
        aria-valuemax={yearMax}
        aria-valuenow={cur.year}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); onYear(frames[Math.max(0, idx - 1)].year); }
          if (e.key === "ArrowRight") { e.preventDefault(); onYear(frames[Math.min(n - 1, idx + 1)].year); }
          if (e.key === "Home") { e.preventDefault(); onYear(yearMin); }
          if (e.key === "End") { e.preventDefault(); onYear(yearMax); }
        }}
      >
        <Sprockets count={Math.min(46, n)} />
        <div className="relative overflow-hidden" style={{ height }}>
          <canvas ref={strip} className="block h-full w-full" />
          <div className="scanlines pointer-events-none absolute inset-0 opacity-30" />
          {developed < 1 && (
            <div className="pointer-events-none absolute inset-y-0 z-20 w-16 -translate-x-full"
              style={{ left: `${developed * 100}%`, background: "linear-gradient(90deg, transparent, rgba(245,239,226,0.10) 70%, rgba(245,239,226,0.55))" }} />
          )}

          {/* the cutoff, burned into the strip */}
          <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${cutoffX}%` }}>
            <div className="h-full w-px bg-carmine shadow-[0_0_10px_#E8446B]" />
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 z-[9] bg-carmine/12"
            style={{ left: 0, width: `${cutoffX}%`, boxShadow: "inset -1px 0 0 rgba(232,68,107,0.35)" }}
          />

          {/* where the archive says the land changed */}
          {breakX !== null && (
            <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${breakX}%` }}>
              <div className="h-full w-px bg-soil/90 shadow-[0_0_8px_rgba(127,212,217,0.8)]" />
            </div>
          )}

          {/* playhead */}
          <motion.div
            className="pointer-events-none absolute inset-y-0 z-20"
            style={{ left: `${xFor(head)}%` }}
            animate={{ left: `${xFor(head)}%` }}
            transition={dragging || playing ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="absolute inset-y-0 -left-[1px] w-[2px] bg-halide shadow-[0_0_14px_rgba(245,239,226,0.9)]" />
            <div className="absolute -top-[1px] -left-[5px] h-[4px] w-[11px] bg-halide" />
            <div className="absolute -bottom-[1px] -left-[5px] h-[4px] w-[11px] bg-halide" />
          </motion.div>
        </div>
        <Sprockets count={Math.min(46, n)} />
      </div>

      {/* rulers */}
      <div className="relative mt-1.5 h-[11px]">
        {decades.map(({ f, i }) => (
          <div key={f.year}
            className={`absolute top-0 ${f.year % 20 === 0 ? "" : "hidden sm:block"}`}
            style={{ left: `${xFor(i)}%`, transform: "translateX(-50%)" }}>
            <div className="mx-auto h-[3px] w-px bg-line2" />
            <div className="readout mt-0.5 text-[8.5px] text-dim2">{f.year}</div>
          </div>
        ))}
        <div className="absolute top-0" style={{ left: `${cutoffX}%`, transform: "translateX(-50%)" }}>
          <div className="mx-auto h-[3px] w-px bg-carmine" />
          <div className="console mt-0.5 whitespace-nowrap text-[7.5px] text-carmine">13 dec 2005</div>
        </div>
      </div>

      {/* which instrument was overhead */}
      <div className="mt-5 hidden gap-px sm:flex">
        {ERAS.map((e) => {
          const a = Math.max(0, frames.findIndex((f) => f.year >= e.from));
          const bIdx = frames.findIndex((f) => f.year > e.to);
          const b = bIdx < 0 ? n : bIdx;
          const w = ((b - a) / n) * 100;
          if (w <= 0) return null;
          const active = cur.year >= e.from && cur.year <= e.to;
          return (
            <div key={e.label} style={{ width: `${w}%` }} className="min-w-0">
              <div
                className="h-[2px] transition-all duration-300"
                style={{ background: active ? "#F5EFE2" : e.tint, opacity: active ? 1 : 0.4 }}
              />
              <div
                className="console truncate pt-1 text-[7.5px] transition-colors duration-300"
                style={{ color: active ? "#F5EFE2" : "#5D6D77" }}
              >
                {w < 7 ? "\u00a0" : e.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
