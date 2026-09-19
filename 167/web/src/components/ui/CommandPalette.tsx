/**
 * Command palette — cmdk (github.com/pacocoursey/cmdk, MIT), the primitive
 * behind shadcn/ui's Command. Styled to tokens; one of the two surfaces where
 * glass is permitted (06 §4), because it genuinely floats over the scene.
 */

import { Command } from 'cmdk'
import type { ReactNode } from 'react'

export interface PaletteItem {
  id: string
  label: string
  hint?: string
  meta?: ReactNode
  onSelect: () => void
}

export function CommandPalette({ open, onOpenChange, groups, placeholder = 'Type a question or pick one…' }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  groups: { heading: string; items: PaletteItem[] }[]
  placeholder?: string
}) {
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Example queries"
      overlayClassName="fixed inset-0 z-[80] bg-ink/20"
      contentClassName="glass raised fixed left-1/2 top-[14vh] z-[81] w-[min(720px,92vw)] -translate-x-1/2 overflow-hidden"
    >
      <div className="flex items-center gap-3 border-b border-rule px-4">
        <span className="label">Ask</span>
        <Command.Input placeholder={placeholder} className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
        <kbd className="mono rounded border border-rule px-1.5 text-[11px] text-ink-2">esc</kbd>
      </div>
      <Command.List className="scroll-thin max-h-[56vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-ink-2">No example matches. Press Enter in the query bar to ask it anyway.</Command.Empty>
        {groups.map((g) => (
          <Command.Group key={g.heading} heading={g.heading} className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1">
            {g.items.map((it) => (
              <Command.Item
                key={it.id}
                value={`${it.label} ${it.hint ?? ''}`}
                onSelect={() => { it.onSelect(); onOpenChange(false) }}
                className="flex cursor-pointer items-baseline justify-between gap-4 px-3 py-2.5 data-[selected=true]:bg-accent-bg"
              >
                <span className="text-[14.5px] text-ink">{it.label}</span>
                <span className="mono shrink-0 text-[11px] text-ink-2">{it.meta ?? it.hint}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  )
}
