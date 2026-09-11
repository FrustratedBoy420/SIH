/**
 * Text Effect — Motion Primitives (motion-primitives.com, ibelick/motion-primitives), MIT.
 * Trimmed to the presets this site uses. The screen-reader copy is kept: the
 * split segments are aria-hidden and the full string is announced once.
 */

import React from 'react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { cn } from '@/lib/utils'

type Per = 'word' | 'char' | 'line'
type Preset = 'blur' | 'fade-in-blur' | 'slide' | 'fade' | 'rise'

const stagger: Record<Per, number> = { char: 0.024, word: 0.05, line: 0.1 }

const presets: Record<Preset, Variants> = {
  blur: { hidden: { opacity: 0, filter: 'blur(12px)' }, visible: { opacity: 1, filter: 'blur(0px)' } },
  'fade-in-blur': { hidden: { opacity: 0, y: 20, filter: 'blur(12px)' }, visible: { opacity: 1, y: 0, filter: 'blur(0px)' } },
  slide: { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } },
  fade: { hidden: { opacity: 0 }, visible: { opacity: 1 } },
  // A line-mask rise: each segment comes up from below its own baseline.
  rise: { hidden: { y: '105%' }, visible: { y: '0%' } },
}

const Segment = React.memo(({ text, per, variants, mask }: { text: string; per: Per; variants: Variants; mask: boolean }) => {
  const inner = per === 'char'
    ? <span className="inline-block whitespace-pre">{text.split('').map((c, i) => <motion.span key={i} aria-hidden className="inline-block whitespace-pre" variants={variants}>{c}</motion.span>)}</span>
    : <motion.span aria-hidden variants={variants} className={per === 'line' ? 'block' : 'inline-block whitespace-pre'}>{text}</motion.span>
  // The mask is padded below and pulled back by the same amount so descenders
  // (g, y, p) are not clipped by the overflow that makes the rise a mask.
  return mask ? <span className={cn('-mb-[0.16em] overflow-hidden pb-[0.16em] align-bottom', per === 'line' ? 'block' : 'inline-block')}>{inner}</span> : inner
})
Segment.displayName = 'Segment'

export function TextEffect({
  children, per = 'word', as = 'p', className, preset = 'fade', delay = 0, speed = 1, trigger = true, duration = 0.3, style,
}: {
  children: string; per?: Per; as?: 'p' | 'h1' | 'h2' | 'h3' | 'span' | 'div'; className?: string; preset?: Preset
  delay?: number; speed?: number; trigger?: boolean; duration?: number; style?: React.CSSProperties
}) {
  const segments = per === 'line' ? children.split('\n') : children.split(/(\s+)/)
  const Tag = motion[as] as typeof motion.div
  const container: Variants = { hidden: {}, visible: { transition: { staggerChildren: stagger[per] / speed, delayChildren: delay } } }
  const item: Variants = {
    ...presets[preset],
    visible: { ...(presets[preset].visible as object), transition: { duration: duration / speed, ease: [0.2, 0.7, 0.3, 1] } },
  }
  return (
    <AnimatePresence mode="popLayout">
      {trigger && (
        <Tag initial="hidden" animate="visible" variants={container} className={className} style={style}>
          <span className="sr-only">{children}</span>
          {segments.map((s, i) => <Segment key={`${i}-${s}`} text={s} per={per} variants={item} mask={preset === 'rise'} />)}
        </Tag>
      )}
    </AnimatePresence>
  )
}
