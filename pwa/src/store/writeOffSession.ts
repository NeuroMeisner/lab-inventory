import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface BatchItem {
  key: string
  packageId: number
  displayCode: string
  name: string
  unit: string | null
  amount: string | null   // null — для режима free
  grantId: number | null
  grantLabel: string | null
}

interface SessionState {
  items: BatchItem[]
  addItem: (item: Omit<BatchItem, 'key'>) => void
  removeItem: (key: string) => void
  clear: () => void
}

export const useWriteOffSession = create<SessionState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) =>
        set((s) => ({ items: [...s.items, { ...item, key: `${Date.now()}-${Math.random()}` }] })),
      removeItem: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'lab-writeoff-session' },
  ),
)