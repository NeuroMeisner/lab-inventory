import axios from 'axios'
import { useAuthStore } from '../store/auth'

export const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1'
export const CODEGEN_URL = import.meta.env.VITE_CODE_GENERATOR_URL ?? '/codegen'

export const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function tryRefresh(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) return null
  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken })
    useAuthStore.getState().setTokens(data.access_token, data.refresh_token)
    return data.access_token as string
  } catch {
    return null
  }
}

api.interceptors.response.use(undefined, async (error) => {
  const original = error.config
  if (error.response?.status === 401 && original && !original._retry) {
    original._retry = true
    refreshPromise = refreshPromise ?? tryRefresh()
    const token = await refreshPromise
    refreshPromise = null
    if (token) {
      original.headers.Authorization = `Bearer ${token}`
      return api(original)
    }
    useAuthStore.getState().logout()
  }
  return Promise.reject(error)
})

export function errorDetail(err: unknown): string {
  const detail = (err as any)?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join('; ')
  return (err as any)?.message ?? 'Unknown error'
}