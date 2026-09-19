/** Marquee — Magic UI (magicui.design/r/marquee), MIT. Restyled; the gap and speed are tokens. */

import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

interface Props extends ComponentPropsWithoutRef<'div'> {
  reverse?: boolean
  pauseOnHover?: boolean
  repeat?: number
}

export function Marquee({ className, reverse = false, pauseOnHover = false, children, repeat = 4, ...props }: Props) {
  return (
    <div {...props} className={cn('group flex gap-(--gap) overflow-hidden [--duration:48s] [--gap:3rem]', className)}>
      {Array.from({ length: repeat }, (_, i) => (
        <div
          key={i}
          aria-hidden={i > 0}
          className={cn(
            'animate-marquee flex shrink-0 flex-row justify-around gap-(--gap)',
            pauseOnHover && 'group-hover:[animation-play-state:paused]',
            reverse && '[animation-direction:reverse]',
          )}
        >
          {children}
        </div>
      ))}
    </div>
  )
}
