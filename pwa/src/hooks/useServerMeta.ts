import { useEffect, useState } from 'react'
import { api } from '../api/client'

export interface ServerMeta {
  dev_mode: boolean
  google_configured: boolean
}

let cache: ServerMeta | null = null

export function useServerMeta(): ServerMeta | null {
  const [meta, setMeta] = useState<ServerMeta | null>(cache)
  useEffect(() => {
    if (cache) return
    api.get('/meta')
      .then((r) => { cache = r.data; setMeta(r.data) })
      .catch(() => {})
  }, [])
  return meta
}