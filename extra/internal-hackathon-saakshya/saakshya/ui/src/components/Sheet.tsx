import { motion } from "motion/react";

/* The record side. Everything the system says about a claim in legal
   language lives on paper: warm stock, a printed form grid, serif body. */

export function Sheet({
  children, className = "", delay = 0, id,
}: { children: React.ReactNode; className?: string; delay?: number; id?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22, rotateX: 3 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformPerspective: 1400 }}
      className={`sheet relative ${className}`}
      id={id}
    >
      {/* the punched margin of a departmental form */}
      <div className="pointer-events-none absolute inset-y-0 left-[26px] w-px bg-carmine2/20" />
      {children}
    </motion.div>
  );
}

export function SheetHead({ kicker, title, right }: { kicker: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b-[1.5px] border-ink/25 px-8 pt-7 pb-4">
      <div className="min-w-0">
        <div className="console text-[8px] text-ink2">{kicker}</div>
        <h2 className="record mt-1.5 text-[26px] leading-[1.08] font-medium text-ink">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function Field({
  label, children, className = "",
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`py-3 ${className}`}>
      <div className="console text-[7.5px] text-ink2">{label}</div>
      <div className="record mt-1 text-[15px] leading-snug text-ink">{children}</div>
    </div>
  );
}

/** Quoted text from the scanned order — set as a photocopy, not as prose. */
export function Quoted({ text, ocr }: { text: string; ocr: number }) {
  return (
    <div className="relative border-l-2 border-ink/25 bg-ink/[0.045] py-3 pr-4 pl-4">
      <p className="record text-[14.5px] leading-relaxed text-ink italic">“{text}”</p>
      <div className="console mt-2 flex items-center gap-2 text-[7.5px] text-ink2">
        <span>Extracted by VAANI</span>
        <span className="h-2 w-px bg-ink/25" />
        <span>OCR confidence {ocr.toFixed(2)}</span>
      </div>
    </div>
  );
}
