import { useEffect, useState } from 'react'
import { Skeleton, Stack, Typography } from '@mui/material'
import { api } from '../api/client'
import type { PackageInfo, TransactionInfo } from '../api/types'
import PackageCard from '../components/PackageCard'
import { useAuthStore } from '../store/auth'

export default function MyPackages() {
  const user = useAuthStore((s) => s.user)
  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    api.get('/transactions', { params: { user_id: user.id, date_from: cutoff, limit: 200 } })
      .then(async (r) => {
        const txs: TransactionInfo[] = r.data.items
        const ids = Array.from(new Set(txs.filter((t) => ['open', 'write_off'].includes(t.type)).map((t) => t.package_id)))
        const pkgs = await Promise.all(
          ids.slice(0, 20).map((id) => api.get(`/packages/${id}`).then((p) => p.data).catch(() => null)),
        )
        setPackages(pkgs.filter(Boolean) as PackageInfo[])
      })
      .finally(() => setLoading(false))
  }, [user])

  return (
    <Stack spacing={2}>
      <Typography variant="h5">My stock (opened / used in last 30 days)</Typography>

      {loading && (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={120} />)}
        </Stack>
      )}

      {!loading && packages.length === 0 && (
        <Typography color="text.secondary">
          Nothing here yet — scan a package and write off something to see it in this list.
        </Typography>
      )}

      {packages.map((p) => <PackageCard key={p.id} pkg={p} currentUserId={user?.id} />)}
    </Stack>
  )
}