import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../api/client'
import type { User } from '../api/types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  loginGoogle: (credential: string) => Promise<void>
  refreshMe: () => Promise<void>
  setTokens: (access: string, refresh: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      loginGoogle: async (credential: string) => {
        const { data } = await api.post('/auth/google', { credential })
        set({ accessToken: data.access_token, refreshToken: data.refresh_token })
        const me = await api.get('/users/me')
        set({ user: me.data })
      },

      refreshMe: async () => {
        const me = await api.get('/users/me')
        set({ user: me.data })
      },

      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),

      logout: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'lab-auth' },
  ),
)