/** Whether the "open the workstation" start dialog is up. A tiny store of its
 * own, not folded into `useStation`: it is asked for from the masthead (every
 * page) and the landing hero alike, and has nothing to do with workstation
 * runtime state. */

import { create } from 'zustand'

export const useStartDialog = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
