import { useEffect, useRef } from "react";
import { blitCover, renderParcel, type ParcelParams } from "../lib/parcelRenderer";

/** One archive frame, blitted out of the shared WebGL context. */
export function ParcelFrame({
  params,
  className = "",
  rounded = false,
}: {
  params: ParcelParams;
  className?: string;
  rounded?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { seed, canopy, sensor, trajectory, year, obs, palette, detail, res } = params;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const r = cv.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const src = renderParcel({ seed, canopy, sensor, trajectory, year, obs, palette, detail, res: res ?? Math.min(768, Math.max(320, w)) });
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      if (!src) { ctx.fillStyle = "#151D24"; ctx.fillRect(0, 0, w, h); return; }
      blitCover(src, ctx, 0, 0, w, h);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [seed, canopy, sensor, trajectory, year, obs, palette, detail, res]);

  return (
    <canvas
      ref={ref}
      className={`block h-full w-full ${rounded ? "rounded-[2px]" : ""} ${className}`}
      aria-label={`Archive frame, ${year}`}
    />
  );
}
