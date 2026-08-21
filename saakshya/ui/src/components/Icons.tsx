type P = { size?: number; className?: string };
const s = (n = 16) => ({ width: n, height: n, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const IconAtlas = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><path d="m9 3-6 3v15l6-3 6 3 6-3V3l-6 3-6-3Z" /><path d="M9 3v15M15 6v15" /></svg>
);
export const IconFilm = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><rect x="2" y="4" width="20" height="16" rx="1" /><path d="M6 4v16M18 4v16M2 12h20" /><path d="M4 8h0M4 16h0M20 8h0M20 16h0" strokeWidth="2.2" /></svg>
);
export const IconGavel = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><path d="m14 3 7 7-3 3-7-7 3-3Z" /><path d="m8.5 8.5 7 7" /><path d="m3 21 6.5-6.5" /><path d="M14 21h8" /></svg>
);
export const IconGrid = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>
);
export const IconVillage = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><path d="M3 21h18" /><path d="M5 21V9l4-3 4 3v12" /><path d="M13 21V13l4-2 4 2v8" /><path d="M8 21v-4h2v4" /></svg>
);
export const IconVoice = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg>
);
export const IconDoc = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><path d="M14 2H6v20h12V6l-4-4Z" /><path d="M14 2v4h4" /><path d="M9 13h6M9 17h4" /></svg>
);
export const IconArrow = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconBook = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22V4.5Z" /><path d="M8 7h8M8 11h5" /></svg>
);
export const IconAlert = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h0" strokeWidth="2" /></svg>
);
export const IconCheck = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><path d="m4 12 5 5L20 6" strokeWidth="2" /></svg>
);
export const IconX = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><path d="M6 6 18 18M18 6 6 18" /></svg>
);
export const IconSearch = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconLayers = ({ size, className }: P) => (
  <svg {...s(size)} className={className}><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></svg>
);
