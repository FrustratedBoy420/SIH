/**
 * Number Ticker — Magic UI (magicui.design/r/number-ticker), MIT.
 * Restyled to tokens; adds reduced-motion (lands on the value at once),
 * prefix/suffix, and `startValue` used as the *anchor* on the results page so
 * a bar or number animates from the published anchor to the measured value.
 */

import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react'
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import { cn } from '@/lib/utils'

interface Props extends ComponentPropsWithoutRef<'span'> {
  value: number
  startValue?: number
  delay?: number
  decimalPlaces?: number
  signed?: boolean
}

export function NumberTicker({ value, startValue = 0, delay = 0, className, decimalPlaces = 0, signed = false, ...props }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  const motionValue = useMotionValue(startValue)
  // Critically damped (damping = 2·√stiffness): lands in under a second with no
  // overshoot. The library default (60/100) is overdamped and creeps for
  // seconds, so a coordinate reads as a wrong coordinate while it settles.
  const springValue = useSpring(motionValue, { stiffness: 170, damping: 26 })
  const isInView = useInView(ref, { once: true, margin: '0px' })

  const fmt = (n: number) => {
    const s = Intl.NumberFormat('en-US', { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })
      .format(Number(Math.abs(n).toFixed(decimalPlaces)))
    return (n < 0 ? '−' : signed ? '+' : '') + s
  }

  useEffect(() => {
    if (!isInView) return
    if (reduce) {
      if (ref.current) ref.current.textContent = fmt(value)
      return
    }
    const t = setTimeout(() => motionValue.set(value), delay * 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionValue, isInView, delay, value, reduce])

  useEffect(() => springValue.on('change', (latest) => {
    if (ref.current && !reduce) ref.current.textContent = fmt(latest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [springValue, decimalPlaces, reduce])

  return (
    <span ref={ref} className={cn('mono inline-block tabular-nums', className)} {...props}>
      {fmt(reduce ? value : startValue)}
    </span>
  )
}
