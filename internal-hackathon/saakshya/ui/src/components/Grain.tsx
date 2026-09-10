import { useEffect, useState } from "react";

/* A single generated noise tile, reused as the film grain over every dark
   surface. Generated once at runtime so nothing ships as a binary asset. */
let cached: string | null = null;
function makeGrain(): string {
  if (cached) return cached;
  const s = 180;
  const c = document.createElement("canvas");
  c.width = s; c.height = s;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 118 + Math.random() * 74;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  cached = c.toDataURL();
  return cached;
}

export function Grain({ opacity = 0.22, className = "" }: { opacity?: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => setUrl(makeGrain()), []);
  if (!url) return null;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-30 mix-blend-overlay ${className}`}
      style={{ backgroundImage: `url(${url})`, backgroundSize: "180px 180px", opacity }}
    />
  );
}
