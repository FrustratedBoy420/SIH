import { Link, useLocation, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { DISTRICT, claimById, villageName } from "../engine/data";
import { IconAtlas, IconFilm, IconGavel, IconGrid, IconVillage, IconVoice, IconBook } from "./Icons";
import { Grain } from "./Grain";

/* ────────────────────────────────────────────────────────────────────────
   The band selector. Every screen is the same district seen on a different
   band, so navigation is a tuner: ticks, a sliding index, and a ruler that
   tells you where in the district you currently are.
   ──────────────────────────────────────────────────────────────────────── */

const BANDS = [
  { to: "/atlas", label: "Atlas", icon: IconAtlas, key: "atlas" },
  { to: "/claim", label: "Evidence", icon: IconFilm, key: "claim" },
  { to: "/decision", label: "Decision", icon: IconGavel, key: "decision" },
  { to: "/district", label: "District", icon: IconGrid, key: "district" },
  { to: "/village", label: "Village", icon: IconVillage, key: "village" },
  { to: "/sabha", label: "Gram Sabha", icon: IconVoice, key: "sabha" },
  { to: "/method", label: "Method", icon: IconBook, key: "method" },
];

export function Shell({ children, claimId }: { children: React.ReactNode; claimId?: string }) {
  const loc = useLocation();
  const { id, code } = useParams();
  const active =
    loc.pathname.startsWith("/dossier")
      ? "decision"
      : (BANDS.find((b) => loc.pathname.startsWith(b.to))?.key ?? "atlas");
  const cid = claimId ?? id;
  const claim = cid ? claimById.get(cid) : undefined;

  const trail = [
    { t: DISTRICT.state, w: 1 },
    { t: `${DISTRICT.name} district`, w: 1 },
    ...(claim ? [{ t: villageName(claim.village_lgd), w: 1 }] : code ? [{ t: villageName(code), w: 1 }] : []),
    ...(claim ? [{ t: claim.claim_id, w: 1 }] : []),
  ];

  const href = (b: (typeof BANDS)[number]) => {
    if (b.key === "claim") return cid ? `/claim/${cid}` : "/claim/FRA-DND-0007";
    if (b.key === "decision") return cid ? `/decision/${cid}` : "/decision/FRA-DND-0007";
    if (b.key === "sabha") return cid ? `/sabha/${cid}` : "/sabha/FRA-DND-0007";
    if (b.key === "village") return code ? `/village/${code}` : `/village/${claim?.village_lgd ?? "D-BAJAG"}`;
    return b.to;
  };

  return (
    <div className="grain flex h-dvh flex-col overflow-hidden bg-void">
      <header className="relative z-40 shrink-0 border-b border-line bg-deck/95 backdrop-blur">
        <div className="flex h-[52px] items-stretch">
          <Link to="/" className="group flex shrink-0 items-center gap-2.5 border-r border-line px-5">
            <Sigil />
            <span className="console text-[12px] text-halide">Saakshya</span>
          </Link>

          <nav className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
            {BANDS.map((b) => {
              const on = active === b.key;
              const Icon = b.icon;
              return (
                <Link
                  key={b.key}
                  to={href(b)}
                  className={`group relative flex shrink-0 items-center gap-2 border-r border-line px-4 transition-colors ${
                    on ? "text-halide" : "text-dim2 hover:text-dim"
                  }`}
                >
                  <Icon size={14} />
                  <span className="console text-[9px]">{b.label}</span>
                  {on && (
                    <motion.span
                      layoutId="band-index"
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-carmine"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  {on && <span className="absolute inset-0 -z-10 bg-carmine/[0.07]" />}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-3 border-l border-line px-4">
            <span className="console rounded-[2px] border border-sienna/40 bg-sienna/10 px-2 py-1 text-[8px] text-sienna">
              Prototype data
            </span>
          </div>
        </div>

        {/* the ruler: where you are, drawn as a scale bar */}
        <div className="flex h-[26px] items-center gap-0 overflow-x-auto overflow-y-hidden border-t border-line/70 bg-void/60 px-5 whitespace-nowrap">
          {trail.map((t, i) => (
            <div key={i} className="flex items-center">
              {i > 0 && <span className="mx-2.5 h-[7px] w-px bg-line2" />}
              <span className={`console shrink-0 text-[8.5px] ${i === trail.length - 1 ? "text-halide" : "text-dim2"}`}>{t.t}</span>
            </div>
          ))}
          <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
            <span className="readout text-[9px] text-dim2">22.94° N · 81.15° E</span>
            <span className="h-[7px] w-px bg-line2" />
            <span className="readout text-[9px] text-dim2">EPSG:4326</span>
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
      <Grain opacity={0.16} />
    </div>
  );
}

/* A survey benchmark: the triangulation mark stamped on a toposheet. */
export function Sigil({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <polygon points="12,3 21,19 3,19" fill="none" stroke="#E8446B" strokeWidth="1.6" />
      <circle cx="12" cy="14.2" r="2.6" fill="none" stroke="#F5EFE2" strokeWidth="1.4" />
      <circle cx="12" cy="14.2" r="0.9" fill="#F5EFE2" />
    </svg>
  );
}
