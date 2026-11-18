import { useEffect, useMemo, useState } from 'react'
import { Box, Chip, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material'
import { api } from '../api/client'
import type { FrequentItem, PackageInfo, SearchResult } from '../api/types'
import { useDebounce } from '../hooks/useDebounce'
import { sortByFefo } from '../utils/fefo'
import PackageCard from '../components/PackageCard'
import { useAuthStore } from '../store/auth'

export default function Search() {
  const user = useAuthStore((s) => s.user)
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [frequent, setFrequent] = useState<{ common: FrequentItem[]; personal: FrequentItem[] }>({ common: [], personal: [] })
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [loadingPackages, setLoadingPackages] = useState(false)

  useEffect(() => {
    api.get('/users/frequent').then((r) => setFrequent(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (debouncedQ.trim().length < 2) {
      setResults([])
      setLoadingResults(false)
      return
    }
    setLoadingResults(true)
    api.get('/search', { params: { q: debouncedQ } })
      .then((r) => setResults(r.data))
      .catch(() => setResults([]))
      .finally(() => setLoadingResults(false))
  }, [debouncedQ])

  const categories = useMemo(() => Array.from(new Set(results.map((r) => r.category))), [results])
  const filtered = category ? results.filter((r) => r.category === category) : results

  const loadPackages = (item: SearchResult) => {
    setSelected(item)
    setPackages([])
    setLoadingPackages(true)
    api.get('/packages', { params: { nomenclature_id: item.id, limit: 100 } })
      .then((r) => setPackages(sortByFefo(r.data.items)))
      .catch(() => setPackages([]))
      .finally(() => setLoadingPackages(false))
  }

  const showEmptyResults = !loadingResults && debouncedQ.trim().length >= 2 && filtered.length === 0

  return (
    <Stack spacing={2}>
      <TextField
        label="Search reagents & consumables"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        fullWidth
        type="search"
        inputProps={{ enterKeyHint: 'search', autoComplete: 'off' }}
      />

      {q.length === 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <Box>
            <Typography fontWeight={700} gutterBottom>Frequently used (lab-wide)</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {frequent.common.length === 0 && (
                <Typography variant="body2" color="text.secondary">No data yet.</Typography>
              )}
              {frequent.common.map((f) => (
                <Chip key={f.nomenclature_id} label={`${f.name} (${f.uses})`} onClick={() => setQ(f.name)} clickable />
              ))}
            </Box>
          </Box>
          <Box>
            <Typography fontWeight={700} gutterBottom>My recent usage</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {frequent.personal.length === 0 && (
                <Typography variant="body2" color="text.secondary">No data yet.</Typography>
              )}
              {frequent.personal.map((f) => (
                <Chip key={f.nomenclature_id} label={`${f.name} (${f.uses})`} onClick={() => setQ(f.name)} clickable />
              ))}
            </Box>
          </Box>
        </Box>
      )}

      {results.length > 0 && (
        <TextField select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ maxWidth: 280 }}>
          <MenuItem value="">All categories</MenuItem>
          {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
      )}

      {loadingResults && (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={72} />
          ))}
        </Stack>
      )}

      {showEmptyResults && (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography fontWeight={600} gutterBottom>Nothing found</Typography>
          <Typography variant="body2" color="text.secondary">
            Try a synonym or a CAS number, or scan the package directly.
          </Typography>
        </Box>
      )}

      <Stack spacing={1}>
        {filtered.map((r) => (
          <Box
            key={r.id}
            role="button"
            tabIndex={0}
            onClick={() => loadPackages(r)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadPackages(r) } }}
            sx={{
              p: 1.5,
              border: '1px solid',
              borderColor: selected?.id === r.id ? 'primary.main' : 'divider',
              borderRadius: 2,
              cursor: 'pointer',
              minHeight: 64,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Typography fontWeight={700}>{r.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {r.category} · {r.unit}{r.cas_number ? ` · CAS ${r.cas_number}` : ''} · available: {r.packages_available} pkgs
              {r.total_amount > 0 ? ` (${r.total_amount} ${r.unit})` : ''}
              {r.expired_amount > 0 && ` · expired: ${r.expired_amount} ${r.unit}`}
            </Typography>
          </Box>
        ))}
      </Stack>

      {selected && (
        <Stack spacing={1}>
          <Typography fontWeight={700}>
            Packages of «{selected.name}» (FEFO — nearest expiry first)
          </Typography>
          {loadingPackages && (
            <Stack spacing={1}>
              {[0, 1].map((i) => <Skeleton key={i} variant="rounded" height={120} />)}
            </Stack>
          )}
          {!loadingPackages && packages.length === 0 && (
            <Typography variant="body2" color="text.secondary">No packages in stock.</Typography>
          )}
          {packages.map((p) => (
            <PackageCard key={p.id} pkg={p} currentUserId={user?.id} onUpdated={() => loadPackages(selected)} />
          ))}
        </Stack>
      )}
    </Stack>
  )
}