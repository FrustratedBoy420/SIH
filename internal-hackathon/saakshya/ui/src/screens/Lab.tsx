import { useState } from "react";
import { ParcelFrame } from "../components/ParcelFrame";
import { archiveYears, sensorFor } from "../engine/kaal";
import type { Palette } from "../lib/parcelRenderer";

/* Development only: a contact sheet of the renderer across sensors, canopy
   and palette, so a regression is visible in one screenshot. */
export default function Lab() {
  const [palette, setPalette] = useState<Palette>("natural");
  const years = [1967, 1971, 1976, 1986, 1990, 1996, 2004, 2008, 2014, 2020, 2024];
  const canopies = [0.92, 0.7, 0.45, 0.2];
  void archiveYears;
  return (
    <div className="min-h-dvh bg-void p-6 text-halide">
      <div className="mb-4 flex gap-2">
        {(["natural", "infrared"] as const).map((p) => (
          <button key={p} onClick={() => setPalette(p)}
            className={`console rounded-[2px] border px-3 py-1.5 text-[9px] ${palette === p ? "border-halide" : "border-line2 text-dim2"}`}>
            {p}
          </button>
        ))}
      </div>
      {canopies.map((c) => (
        <div key={c} className="mb-3">
          <div className="console mb-1 text-[8px] text-dim2">canopy {c}</div>
          <div className="flex gap-1">
            {years.map((y) => (
              <div key={y} className="relative w-[152px]">
                <div className="aspect-square">
                  <ParcelFrame params={{ seed: 4242, canopy: c, sensor: sensorFor(y), trajectory: "forest_to_cultivation", year: y, obs: 20, detail: 1.7, res: 512, palette }} />
                </div>
                <div className="readout mt-0.5 text-[8px] text-dim2">{y} · {sensorFor(y)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
