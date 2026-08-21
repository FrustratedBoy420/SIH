import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useScroll, useTransform } from "motion/react";
import { ParcelFrame } from "../components/ParcelFrame";
import { Grain } from "../components/Grain";
import { Counter, Eyebrow } from "../components/Instruments";
import { Sigil } from "../components/Shell";
import { IconArrow } from "../components/Icons";
import { CLAIMS, DISTRICT_STATS, FEATURED, kaalFor } from "../engine/data";
import { COVER_CLASSES } from "../lib/parcelRenderer";
import { CUTOFF, SENSOR_LABEL } from "../engine/kaal";

export default function Landing() {
  const kaal = useMemo(() => kaalFor(FEATURED), []);
  const frames = kaal.frames;
  const [i, setI] = useState(0);
  const [held, setHeld] = useState(false);
  const hero = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const heroFade = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  /* The archive runs forward, stops dead on the cutoff long enough to read it,
     then carries on to today — because the farming did too. */
  useEffect(() => {
    const cutIdx = frames.findIndex((f) => f.year === CUTOFF);
    const last = frames.length - 1;
    const RUN = 5400, HOLD = 1600, TAIL = 2400;
    let raf = 0;
    const t0 = performance.now() + 900;
    const tick = (t: number) => {
      const e = t - t0;
      // held drives the copy reveal, so it must latch on elapsed time and not
      // on hitting a particular branch — a slow first frame can skip one.
      if (e >= RUN) setHeld(true);
      if (e < RUN) {
        setI(Math.max(0, Math.min(cutIdx, Math.floor((e / RUN) * cutIdx))));
      } else if (e < RUN + HOLD) {
        setI(cutIdx);
      } else if (e < RUN + HOLD + TAIL) {
        const k = (e - RUN - HOLD) / TAIL;
        setI(cutIdx + Math.floor(k * (last - cutIdx)));
      } else {
        setI(last);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frames]);

  const f = frames[i];
  const crossed = f.year >= CUTOFF;

  return (
    <div className="grain min-h-dvh bg-void">
      {/* ── masthead ─────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 flex items-center gap-3 bg-gradient-to-b from-void via-void/85 to-transparent px-6 py-5 lg:px-10">
        <Sigil size={20} />
        <span className="console text-[13px] text-halide">Saakshya</span>
        <span className="ml-3 hidden h-3 w-px bg-line2 sm:block" />
        <span className="console hidden text-[8px] text-dim2 sm:block">Problem statement 25108 · Ministry of Tribal Affairs</span>
        <div className="flex-1" />
        <Link to="/method" className="console text-[8.5px] text-dim2 transition-colors hover:text-halide">Method</Link>
        <Link to="/atlas"
          className="group ml-5 flex items-center gap-2 rounded-[2px] border border-brass/60 px-4 py-2 text-brass transition-colors hover:bg-brass hover:text-void">
          <span className="console text-[8.5px]">Enter the atlas</span>
          <IconArrow size={13} className="transition-transform group-hover:translate-x-1" />
        </Link>
      </header>

      {/* ── hero: fifty-eight years, running ────────────────────── */}
      <section ref={hero} className="relative h-dvh overflow-hidden">
        <motion.div style={{ y: heroY, opacity: heroFade }} className="absolute inset-0">
          <ParcelFrame params={{ seed: kaal.seed, canopy: f.canopy, sensor: f.sensor, trajectory: kaal.trajectory_class, year: f.year, obs: f.obs, res: 900, detail: 2.6 }} />
          <div className="scanlines absolute inset-0 opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-t from-void via-void/34 to-void/55" />
          <div className="absolute inset-0 bg-gradient-to-r from-void/85 via-transparent to-void/40" />
        </motion.div>

        {/* the running year, set as an instrument reading */}
        <div className="absolute top-1/2 right-6 -translate-y-1/2 text-right lg:right-10">
          <div className="readout text-[clamp(64px,10vw,150px)] leading-[0.82] font-medium text-halide/85 tabular-nums">
            {f.year}
          </div>
          <div className="console mt-2 text-[8px] text-dim2">{SENSOR_LABEL[f.sensor]}</div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <span className="h-px w-14 bg-line2" />
            <span className="readout text-[10px] text-dim2">one claim parcel, Dindori</span>
          </div>
          <div className="mt-5 flex flex-col items-end gap-1.5">
            {COVER_CLASSES.slice(0, 3).map((c) => (
              <span key={c.key} className="flex items-center gap-2">
                <span className="console text-[7.5px] text-halide/60">{c.label}</span>
                <span className="h-[10px] w-[10px] rounded-[1px] ring-1 ring-halide/25" style={{ background: c.natural }} />
              </span>
            ))}
          </div>
        </div>

        {/* the cutoff arrives as a physical bar across the frame */}
        <AnimatePresence>
          {crossed && (
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 top-[38%] z-10 origin-left">
              <div className="h-[2px] w-full bg-carmine shadow-[0_0_24px_#E8446B]" />
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="mt-2 px-6 lg:px-10">
                <span className="console bg-carmine px-2.5 py-1 text-[8.5px] text-void">13 December 2005 · the statutory cutoff</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute inset-x-0 bottom-0 px-6 pb-14 lg:px-10">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}>
            <Eyebrow tone="#D9A441">Forest Rights Act, 2006</Eyebrow>
            <h1 className="display-xl mt-4 max-w-[15ch] text-[clamp(46px,8.2vw,124px)] text-halide">
              Existing tools map the claims that were granted.
            </h1>
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: held ? 1 : 0 }} transition={{ duration: 0.8, delay: 0.3 }}
              className="record mt-6 max-w-[36ch] text-[clamp(21px,2.4vw,34px)] leading-[1.22] text-halide">
              Saakshya rebuilds the proof for the claims that were <span className="text-carmine">refused</span>.
            </motion.p>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: held ? 1 : 0 }} transition={{ duration: 0.7, delay: 0.7 }}
              className="mt-8 flex flex-wrap items-center gap-5">
              <Link to="/atlas"
                className="group flex items-center gap-3 bg-brass px-6 py-3.5 text-void transition-colors hover:bg-[#E9B75C]">
                <span className="console text-[9.5px]">Open the district atlas</span>
                <IconArrow size={16} className="transition-transform group-hover:translate-x-1.5" />
              </Link>
              <Link to={`/claim/${FEATURED}`} className="console border-b border-halide/40 pb-1 text-[9px] text-halide transition-colors hover:border-halide">
                Or go straight to one refused claim
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── the scale of it ─────────────────────────────────────── */}
      <section className="relative border-t border-line px-6 py-24 lg:px-10">
        <div className="mx-auto grid max-w-[1400px] gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <Eyebrow>The failure this is built around</Eyebrow>
            <h2 className="display-xl mt-4 max-w-[16ch] text-[clamp(34px,4.4vw,64px)] text-halide">
              Nearly half of all community claims come back refused.
            </h2>
            <p className="mt-6 max-w-[54ch] text-[15px] leading-[1.7] text-dim">
              The Act recognises rights over forest land occupied before 13 December 2005. The families have
              been there for generations. What they do not have is paper. Roughly{" "}
              <span className="text-halide">47,901 community claims</span> have been rejected nationally, and
              the single most common ground recorded is that the claimant could not produce documentary proof
              of occupation before the cutoff.
            </p>
            <p className="mt-5 max-w-[54ch] text-[13px] leading-relaxed text-dim2">
              They cannot prove it. Landsat has photographed the whole land surface every year since 1972, and
              declassified Corona film reaches back to 1967. The archive can.
            </p>

            <ArchiveSpan />
          </div>

          <RefusalField />
        </div>
      </section>

      {/* ── past, present, action ───────────────────────────────── */}
      <section className="border-t border-line px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-[1400px]">
          <Eyebrow>How the platform is shaped</Eyebrow>
          <h2 className="display-xl mt-4 max-w-[20ch] text-[clamp(32px,4vw,58px)] text-halide">
            Past, present, and what an officer can do on Monday.
          </h2>

          <div className="mt-14 grid gap-px bg-line md:grid-cols-3">
            {[
              {
                era: "Past",
                title: "Evidence engine",
                bands: "KAAL · VAANI",
                body:
                  "Reads the annual satellite archive back to 1967 and dates the year forest became farm or homestead. Reads the rejection order itself and classifies the ground recorded for refusal.",
                out: "A dated finding with its confidence and its drivers",
              },
              {
                era: "Present",
                title: "FRA Atlas",
                bands: "SEEMA",
                body:
                  "Segments today's imagery into farm, forest, water and homestead, holds every claim layer — individual, community, community forest — and finds where boundaries collide.",
                out: "A live district map with conflict and evidence layers",
              },
              {
                era: "Action",
                title: "Decision engine",
                bands: "NYAYA · SETU",
                body:
                  "Matches the ground for refusal to the evidence that answers it, routes the appeal to the forum that can hear it with its sixty-day window, and lists what recognition would unlock.",
                out: "A filing, a deadline, and a convergence plan",
              },
            ].map((c, i) => (
              <motion.div key={c.era}
                initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.65, delay: i * 0.11, ease: [0.16, 1, 0.3, 1] }}
                className="group relative bg-deck p-8">
                <div className="flex items-baseline justify-between">
                  <span className="console text-[8px] text-brass">{c.era}</span>
                  <span className="console text-[7.5px] text-dim2">{c.bands}</span>
                </div>
                <h3 className="record mt-4 text-[30px] leading-none text-halide">{c.title}</h3>
                <p className="mt-4 text-[13.5px] leading-relaxed text-dim">{c.body}</p>
                <div className="mt-7 border-t border-line pt-4">
                  <div className="console text-[7px] text-dim2">What comes out</div>
                  <div className="mt-1.5 text-[13px] text-halide">{c.out}</div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-px grid gap-px bg-line md:grid-cols-3">
            <div className="bg-deckr px-8 py-5 md:col-span-3">
              <p className="text-[13.5px] leading-relaxed text-dim">
                <span className="console mr-3 text-[8px] text-halide">Worked through</span>
                A transition dated to 1994 → the parcel is under cultivation today → the village has irrigation
                on 14 per cent of its land → water infrastructure becomes the ranked intervention, with the
                schemes that fund it and the arithmetic that chose it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── what it will not do ─────────────────────────────────── */}
      <section className="border-t border-line px-6 py-24 lg:px-10">
        <div className="mx-auto grid max-w-[1400px] gap-14 lg:grid-cols-[minmax(0,1fr)_460px]">
          <div>
            <Eyebrow tone="#D9A441">Stated limits</Eyebrow>
            <h2 className="display-xl mt-4 max-w-[18ch] text-[clamp(30px,3.6vw,52px)] text-halide">
              What this does not do, said out loud.
            </h2>
            <div className="mt-9 divide-y divide-line border-y border-line">
              {[
                ["It does not decide rights.", "The output is an evidence bundle for human review. Under Rule 13 satellite imagery supplements other evidence; it never replaces it, and it is never the sole basis for a decision."],
                ["It cannot reach the OTFD threshold.", "Other Traditional Forest Dwellers must show roughly seventy-five years of occupation — around 1930. No satellite record goes back that far. Those claims are marked strengthened, not proven, and the interface says so."],
                ["It never renders an absence of evidence.", "A finding that would cut against a claimant is withheld from every claimant-facing artefact. The archive is used for recovery, not for eviction targeting."],
                ["Its records here are synthetic.", "Per-claim polygons and rejection orders are not published anywhere. The district in this build is realistic and fabricated, and every screen says so."],
              ].map(([h, b], i) => (
                <motion.div key={h as string}
                  initial={{ opacity: 0, x: -14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.55, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                  className="grid gap-4 py-6 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
                  <h3 className="record text-[20px] leading-snug text-halide">{h}</h3>
                  <p className="text-[13.5px] leading-relaxed text-dim">{b}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="sheet self-start p-8">
            <div className="console text-[7.5px] text-ink2">Prototype district</div>
            <div className="record mt-2 text-[34px] leading-none text-ink">Dindori</div>
            <div className="record text-[16px] text-ink2 italic">Madhya Pradesh</div>
            <dl className="mt-7 space-y-3 border-t border-ink/20 pt-5">
              {[
                ["Claims on record", DISTRICT_STATS.total],
                ["Refused", DISTRICT_STATS.rejected],
                ["Archive answers the ground", DISTRICT_STATS.recoverable],
                ["Appeal window already closed", DISTRICT_STATS.lapsed],
                ["Boundary conflicts detected", DISTRICT_STATS.conflicts],
              ].map(([k, v]) => (
                <div key={k as string} className="flex items-baseline justify-between gap-4">
                  <dt className="console text-[7.5px] text-ink2">{k}</dt>
                  <dd className="readout text-[19px] text-ink"><Counter to={v as number} duration={1.2} /></dd>
                </div>
              ))}
            </dl>
            <Link to="/atlas" className="group mt-7 flex items-center justify-between border-t border-ink/20 pt-5 text-ink">
              <span className="console text-[9px]">Walk the district</span>
              <IconArrow size={16} className="transition-transform group-hover:translate-x-1.5" />
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-line px-6 py-8 lg:px-10">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2">
          <Sigil size={16} />
          <span className="console text-[8.5px] text-dim2">Saakshya · evidence for the claims that were refused</span>
          <span className="console ml-auto text-[7.5px] text-dim2">
            Landsat MSS/TM/ETM+/OLI · Sentinel-2 · Corona KH-4B · Bhuvan · LGD · MoTA monthly progress reports
          </span>
        </div>
      </footer>

      <Grain opacity={0.14} className="fixed" />
    </div>
  );
}

/* What the archive actually covers, against what the law asks for. */
function ArchiveSpan() {
  const spans = [
    { label: "Corona KH-4B", from: 1967, to: 1972, tint: "#8C7B5E" },
    { label: "Landsat", from: 1972, to: 2025, tint: "#5F818C" },
    { label: "Sentinel-2", from: 2017, to: 2025, tint: "#7FD4D9" },
  ];
  const A = 1960, B = 2032;
  const x = (y: number) => ((y - A) / (B - A)) * 100;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="mt-12 max-w-[540px] border-t border-line pt-6">
      <Eyebrow>What the archive reaches</Eyebrow>
      <div className="relative mt-5 space-y-2.5 pr-[26%]">
        {spans.map((sp, i) => (
          <div key={sp.label} className="relative h-[16px]">
            <motion.div className="absolute inset-y-0 rounded-[1px]"
              style={{ left: `${x(sp.from)}%`, background: sp.tint }}
              initial={{ width: 0 }} whileInView={{ width: `${x(sp.to) - x(sp.from)}%` }} viewport={{ once: true }}
              transition={{ duration: 0.9, delay: 0.15 + i * 0.12, ease: [0.16, 1, 0.3, 1] }} />
            <span className="console absolute top-1/2 -translate-y-1/2 pl-2 text-[7px] whitespace-nowrap"
              style={{ left: `${x(sp.to)}%`, color: sp.tint }}>{sp.label} {sp.from}–{sp.to === 2025 ? "now" : sp.to}</span>
          </div>
        ))}
        <div className="absolute inset-y-[-6px] w-px bg-carmine" style={{ left: `${x(2005)}%` }} />
      </div>
      <div className="relative mt-2 h-[22px] pr-[26%]">
        {[1960, 1980, 2000, 2020].map((y) => (
          <span key={y} className="readout absolute text-[8.5px] text-dim2" style={{ left: `${x(y)}%`, transform: "translateX(-50%)" }}>{y}</span>
        ))}
        <span className="console absolute text-[7px] whitespace-nowrap text-carmine"
          style={{ left: `${x(2005)}%`, transform: "translateX(-50%)", top: 12 }}>the cutoff</span>
      </div>
      <p className="mt-6 text-[12px] leading-relaxed text-dim2">
        Everything to the left of the carmine line is inside the archive. For a Scheduled Tribe household, the
        legal question falls entirely within it. For an Other Traditional Forest Dweller, the seventy-five-year
        test lands around 1930 — off the chart, and the platform says so rather than guessing.
      </p>
    </motion.div>
  );
}

/* One mark per claim on record in the prototype district. Carmine marks are
   the refusals — the thing this platform exists for. */
function RefusalField() {
  const marks = useMemo(
    () => CLAIMS.map((c) => ({ id: c.claim_id, refused: c.status === "rejected" })),
    [],
  );
  const refused = marks.filter((m) => m.refused).length;
  const pctRefused = Math.round((refused / marks.length) * 100);

  return (
    <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: "-100px" }}
      className="self-start">
      <div className="console mb-3 flex items-baseline justify-between text-[7.5px] text-dim2">
        <span>One mark, one claim · Dindori prototype dataset</span>
        <span>{marks.length} on record</span>
      </div>
      <div className="grid grid-cols-16 gap-[3px]" style={{ gridTemplateColumns: "repeat(16, minmax(0,1fr))" }}>
        {marks.map((m, i) => (
          <motion.div key={m.id}
            initial={{ opacity: 0, scale: 0.3 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
            transition={{ duration: 0.32, delay: Math.min(1.4, i * 0.006), ease: [0.16, 1, 0.3, 1] }}
            className="aspect-square rounded-[1px]"
            style={{ background: m.refused ? "#E8446B" : "#1C262E", boxShadow: m.refused ? "0 0 9px rgba(232,68,107,0.35)" : "none" }} />
        ))}
      </div>
      <div className="mt-6 flex items-baseline gap-5 border-t border-line pt-5">
        <span className="readout text-[52px] leading-none text-carmine">
          <Counter to={pctRefused} duration={1.6} suffix="%" />
        </span>
        <span className="max-w-[34ch] text-[12.5px] leading-relaxed text-dim">
          of the claims on record here came back refused. Every carmine mark is one household or one Gram
          Sabha told to prove something it cannot put on paper.
        </span>
      </div>
      <p className="console mt-4 text-[7px] leading-relaxed text-dim2">
        The national figure traces to MoTA monthly progress reports. District figures come from the prototype
        dataset and are synthetic.
      </p>
    </motion.div>
  );
}
