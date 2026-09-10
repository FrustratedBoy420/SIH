import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Shell } from "../components/Shell";
import { ParcelFrame } from "../components/ParcelFrame";
import { Stamp } from "../components/Instruments";
import { IconArrow, IconDoc, IconVoice, IconAtlas } from "../components/Icons";
import { claimById, kaalFor, nyayaFor, villageName } from "../engine/data";
import { CUTOFF } from "../engine/kaal";
import { fmtDate } from "../lib/ui";

/* The Gram Sabha reads the same result on paper, in its own language, at a
   size that does not need a desk. The archive frames carry the finding for
   anyone who cannot read either language. */

type Lang = "en" | "hi";

export default function GramSabha() {
  const { id = "FRA-DND-0007" } = useParams();
  const [lang, setLang] = useState<Lang>("en");
  const claim = claimById.get(id);
  if (!claim) return <Shell><div className="p-10 text-dim">No such claim.</div></Shell>;

  const kaal = kaalFor(id);
  const nyaya = nyayaFor(id);
  const conv = kaal.conversion_year;
  const before = kaal.frames.find((f) => f.year === Math.max(1967, conv - 8))!;
  const after = kaal.frames.find((f) => f.year === Math.min(2025, conv + 10))!;
  const now = kaal.frames[kaal.frames.length - 1];
  const village = villageName(claim.village_lgd);

  const T = {
    en: {
      kicker: "For the Gram Sabha",
      head: `The satellite saw this land being farmed in ${conv}`,
      sub: `That is ${CUTOFF - conv} years before the law's cutoff of 13 December 2005. The pictures below come from the government satellite archive, one for each period.`,
      before: `${before.year} — forest`,
      after: `${after.year} — fields`,
      now: `${now.year} — today`,
      whatNext: "What to do next",
      actions: ["Take the evidence paper", "Record an elder speaking", "Walk and mark the boundary"],
      actionNotes: [
        "A printed dossier with the pictures, the dates and the legal reference, ready to file.",
        "The Gram Sabha's own testimony is the other half of the evidence. Imagery alone is never enough.",
        "Walk the edge of the plot with a phone. The trace goes into the same file.",
      ],
      honest: "Honest limit",
      honestBody:
        "Satellite pictures support a claim. They do not decide it. Under Rule 13 they sit beside the Gram Sabha resolution and oral testimony — the committee weighs all of it together.",
      ownership: "This file belongs to the Gram Sabha. Nothing here is shared without its consent.",
    },
    hi: {
      kicker: "ग्राम सभा के लिए",
      head: `उपग्रह ने इस ज़मीन पर ${conv} में खेती देखी`,
      sub: `यह क़ानून की 13 दिसंबर 2005 की समय-सीमा से ${CUTOFF - conv} साल पहले है। नीचे की तस्वीरें सरकारी उपग्रह अभिलेख से हैं — हर दौर की एक।`,
      before: `${before.year} — जंगल`,
      after: `${after.year} — खेत`,
      now: `${now.year} — आज`,
      whatNext: "आगे क्या करें",
      actions: ["साक्ष्य पत्र लें", "बुज़ुर्ग की गवाही रिकॉर्ड करें", "सीमा चलकर चिह्नित करें"],
      actionNotes: [
        "तस्वीरें, तारीख़ें और क़ानूनी हवाला — दाख़िल करने के लिए तैयार छपा हुआ दस्तावेज़।",
        "ग्राम सभा की अपनी गवाही साक्ष्य का दूसरा आधा हिस्सा है। अकेली तस्वीर कभी काफ़ी नहीं होती।",
        "फ़ोन लेकर खेत के किनारे चलें। वह रेखा इसी फ़ाइल में जुड़ जाएगी।",
      ],
      honest: "ईमानदार सीमा",
      honestBody:
        "उपग्रह की तस्वीरें दावे को मज़बूत करती हैं, तय नहीं करतीं। नियम 13 के तहत ये ग्राम सभा के प्रस्ताव और मौखिक गवाही के साथ रखी जाती हैं — समिति सब कुछ मिलाकर देखती है।",
      ownership: "यह फ़ाइल ग्राम सभा की है। इसकी सहमति के बिना कुछ भी साझा नहीं होता।",
    },
  }[lang];

  const deva = lang === "hi" ? "deva" : "";

  return (
    <Shell claimId={id}>
      <div className="h-full overflow-y-auto bg-paper">
        <div className="mx-auto max-w-[1180px] px-6 py-10 lg:px-10">
          {/* register switch */}
          <div className="flex items-start justify-between gap-6">
            <div className="console flex items-center gap-2 text-[8px] text-ink2">
              <span className="h-px w-5 bg-ink2" />{T.kicker}
            </div>
            <div className="flex gap-px overflow-hidden rounded-[2px] border border-ink/25">
              {(["en", "hi"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)}
                  className={`px-4 py-2 text-[12px] transition-colors ${l === "hi" ? "deva" : "console text-[8.5px]"} ${
                    lang === l ? "bg-ink text-paper" : "text-ink2 hover:bg-ink/8"
                  }`}>
                  {l === "en" ? "English" : "हिन्दी"}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={lang}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>

              <h1 className={`record mt-5 max-w-[19ch] text-[clamp(38px,5.4vw,72px)] leading-[1.02] font-medium text-ink ${deva}`}>
                {T.head}
              </h1>
              <p className={`mt-5 max-w-[62ch] text-[17px] leading-[1.62] text-ink2 ${deva || "record"}`}>{T.sub}</p>

              {/* the pictures do the arguing */}
              <div className="mt-9 grid gap-4 md:grid-cols-3">
                {[[before, T.before], [after, T.after], [now, T.now]].map(([f, label], i) => {
                  const fr = f as typeof before;
                  return (
                    <motion.figure key={fr.year}
                      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.7, delay: 0.15 + i * 0.13, ease: [0.16, 1, 0.3, 1] }}
                      className="bg-void p-2 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.8)]">
                      <div className="relative aspect-[4/3]">
                        <ParcelFrame params={{ seed: kaal.seed, canopy: fr.canopy, sensor: fr.sensor, trajectory: kaal.trajectory_class, year: fr.year, obs: fr.obs, res: 640, detail: 1.9 }} />
                        <div className="scanlines pointer-events-none absolute inset-0 opacity-20" />
                      </div>
                      <figcaption className={`px-1 pt-2.5 pb-1 text-[14px] text-halide ${deva || "record"}`}>{label as string}</figcaption>
                    </motion.figure>
                  );
                })}
              </div>

              {/* the three things a village can actually do */}
              <div className="mt-12">
                <h2 className={`record text-[26px] text-ink ${deva}`}>{T.whatNext}</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    { icon: IconDoc, to: `/dossier/${id}` },
                    { icon: IconVoice, to: `/dossier/${id}` },
                    { icon: IconAtlas, to: "/atlas" },
                  ].map((a, i) => {
                    const Icon = a.icon;
                    return (
                      <motion.div key={i} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}>
                        <Link to={a.to}
                          className="group flex h-full flex-col justify-between border-[1.5px] border-ink/25 bg-ink/[0.03] p-5 transition-all hover:-translate-y-0.5 hover:border-ink hover:bg-ink/[0.06]">
                          <span className="text-ink"><Icon size={26} /></span>
                          <div className="mt-6">
                            <div className={`text-[20px] leading-tight text-ink ${deva || "record"}`}>{T.actions[i]}</div>
                            <p className={`mt-2 text-[13px] leading-relaxed text-ink2 ${deva}`}>{T.actionNotes[i]}</p>
                          </div>
                          <IconArrow size={17} className="mt-5 text-ink2 transition-transform group-hover:translate-x-1" />
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* the limit, stated on the same page as the claim */}
              <div className="mt-12 grid gap-8 border-t-[1.5px] border-ink/25 pt-7 md:grid-cols-[minmax(0,1fr)_260px]">
                <div>
                  <div className={`console text-[8px] text-carmine2 ${deva && "deva"}`}>{T.honest}</div>
                  <p className={`mt-3 max-w-[64ch] text-[16px] leading-[1.62] text-ink ${deva || "record"}`}>{T.honestBody}</p>
                  <p className={`mt-4 text-[13px] text-ink2 ${deva || "record"} italic`}>{T.ownership}</p>
                </div>
                <div className="flex flex-col items-start gap-4">
                  {nyaya && (
                    <Stamp lines={[claim.claim_id, `refused ${fmtDate(claim.rejection_order!.order_date)}`]} tone="#7A2B3C" rotate={-5} delay={0.6} />
                  )}
                  <div className="console text-[7.5px] leading-relaxed text-ink2">
                    {village} · {claim.claim_type} · {claim.area_ha} ha
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Shell>
  );
}
