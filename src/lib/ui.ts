import type { Transition } from "motion/react";

export const EASE_DECK = [0.16, 1, 0.3, 1] as const;
export const EASE_SLAM = [0.34, 1.56, 0.64, 1] as const;

export const deck = (d = 0): Transition => ({ duration: 0.7, ease: EASE_DECK, delay: d });
export const snap = (d = 0): Transition => ({ duration: 0.42, ease: EASE_DECK, delay: d });
export const slam = (d = 0): Transition => ({ duration: 0.55, ease: EASE_SLAM, delay: d });
export const springy: Transition = { type: "spring", stiffness: 260, damping: 26, mass: 0.8 };

/** Staggered reveal used by every panel that loads a record. */
export const stack = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
};
export const stackItem = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: EASE_DECK } },
};

export const STATUS_COLOR = { granted: "#4FA86B", pending: "#6E8BA8", rejected: "#E8446B" } as const;
export const STATUS_LABEL = { granted: "Recognised", pending: "Pending", rejected: "Rejected" } as const;

export const TONE_COLOR = { ok: "#4FA86B", warn: "#D9A441", bad: "#E8446B", mute: "#8B9AA3" } as const;
export const BRASS = "#D9A441";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function fmtDate(iso: string) {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
export const pct = (n: number) => `${Math.round(n * 100)}%`;
