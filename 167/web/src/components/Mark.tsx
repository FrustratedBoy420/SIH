/** A 3×3 pixel tile with one cell lit: a scene, and the pixel the question found. */
export default function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 30" className={className} aria-hidden>
      {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (
        <rect key={`${r}${c}`} x={c * 10} y={r * 10} width={10} height={10}
          fill={r === 0 && c === 2 ? 'var(--color-sun)' : (r + c) % 2 ? 'var(--color-accent)' : 'var(--color-ink)'} />
      )))}
    </svg>
  )
}
