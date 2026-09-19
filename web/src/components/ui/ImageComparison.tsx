/**
 * Image Comparison — Motion Primitives (motion-primitives.com, ibelick/motion-primitives), MIT.
 *
 * Changes from the original: pointer events instead of separate mouse and
 * touch handlers; a real range input underneath so the divider is keyboard-
 * operable and announced (UI-13); both sides carry a text label, so the
 * modality is never carried by the image alone.
 */

import { createContext, useContext, useState, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { cn } from '@/lib/utils'

const Ctx = createContext<{ pos: MotionValue<number> } | null>(null)

export function ImageComparison({ children, className, label = 'Divider position', initial = 50, testId }: {
  children: ReactNode; className?: string; label?: string; initial?: number; testId?: string
}) {
  const raw = useMotionValue(initial)
  const pos = useSpring(raw, { bounce: 0, duration: 0 })
  const [value, setValue] = useState(initial)
  const [drag, setDrag] = useState(false)

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const r = e.currentTarget.getBoundingClientRect()
    const p = Math.min(Math.max(((e.clientX - r.left) / r.width) * 100, 0), 100)
    raw.set(p)
    setValue(Math.round(p))
  }

  return (
    <Ctx.Provider value={{ pos }}>
      <div
        data-testid={testId}
        className={cn('relative touch-none overflow-hidden select-none', className)}
        onPointerDown={(e) => { setDrag(true); e.currentTarget.setPointerCapture(e.pointerId); move(e) }}
        onPointerMove={move}
        onPointerUp={() => setDrag(false)}
        onPointerCancel={() => setDrag(false)}
      >
        {children}
        <input
          type="range" min={0} max={100} value={value} aria-label={label}
          onChange={(e) => { const v = Number(e.target.value); raw.set(v); setValue(v) }}
          className="peer absolute inset-x-0 bottom-0 z-20 h-8 w-full cursor-ew-resize opacity-0"
        />
      </div>
    </Ctx.Provider>
  )
}

export function ImageComparisonImage({ className, alt, src, position }: { className?: string; alt: string; src: string; position: 'left' | 'right' }) {
  const { pos } = useContext(Ctx)!
  const left = useTransform(pos, (v) => `inset(0 0 0 ${v}%)`)
  const right = useTransform(pos, (v) => `inset(0 ${100 - v}% 0 0)`)
  return (
    <motion.img
      src={src} alt={alt} draggable={false}
      className={cn('absolute inset-0 h-full w-full object-cover', className)}
      style={{ clipPath: position === 'left' ? left : right, imageRendering: 'auto' }}
    />
  )
}

export function ImageComparisonSlider({ className, children }: { className?: string; children?: ReactNode }) {
  const { pos } = useContext(Ctx)!
  const left = useTransform(pos, (v) => `${v}%`)
  return (
    <motion.div className={cn('pointer-events-none absolute top-0 bottom-0 z-10 w-px', className)} style={{ left }}>
      {children}
    </motion.div>
  )
}
