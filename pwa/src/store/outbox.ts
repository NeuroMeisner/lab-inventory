import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../api/client'

export interface OutboxItem {
  id: string
  packageId: number
  packageCode: string
  amount: string | null
  grantId: number | null
  createdAt: string
}

interface OutboxState {
  items: OutboxItem[]
  flushing: boolean
  lastError: string | null
  enqueue: (item: Omit<OutboxItem, 'id' | 'createdAt'>) => void
  flush: () => Promise<void>
}

export const useOutboxStore = create<OutboxState>()(
  persist(
    (set, get) => ({
      items: [],
      flushing: false,
      lastError: null,

      enqueue: (item) =>
        set((s) => ({
          items: [...s.items, { ...item, id: `${Date.now()}-${Math.random()}`, createdAt: new Date().toISOString() }],
        })),

      flush: async () => {
        const { items, flushing } = get()
        if (flushing || items.length === 0) return
        set({ flushing: true, lastError: null })
        for (const item of [...get().items]) {
          try {
            await api.post(`/packages/${item.packageId}/write-off`, {
              amount: item.amount,
              grant_id: item.grantId,
              comment: 'Sent from offline queue',
            })
            set((s) => ({ items: s.items.filter((i) => i.id !== item.id) }))
          } catch (err: any) {
            if (!navigator.onLine || !err?.response) {
              set({ lastError: 'Network unavailable — will retry later' })
              break // сеть всё ещё недоступна — пробуем позже
            }
            // Сервер отклонил (400/409) — убираем из очереди, чтобы не спамить
            set((s) => ({
              items: s.items.filter((i) => i.id !== item.id),
              lastError: `Write-off for ${item.packageCode} was rejected: ${err.response?.data?.detail ?? 'conflict'}`,
            }))
          }
        }
        set({ flushing: false })
      },
    }),
    { name: 'lab-outbox' },
  ),
)