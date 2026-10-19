import { useEffect, useMemo, useState } from 'react'
import { Autocomplete, Box, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material'
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
  const [frequent, setFrequent] = useState<{ common: FrequentItem[]; personal: FrequentItem[] }>({ common: [], personal: [] })
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [packages, setPackages] = useState<PackageInfo[]>([])

  useEffect(() => {
    api.get('/users/frequent').then((r) => setFrequent(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (debouncedQ.trim().length < 2) {
      setResults([])
      return
    }
    api.get('/search', { params: { q: debouncedQ } }).then((r) => setResults(r.data)).catch(() => setResults([]))
  }, [debouncedQ])

  const categories = useMemo(() => Array.from(new Set(results.map((r) => r.category))), [results])
  const filtered = category ? results.filter((r) => r.category === category) : results

  const loadPackages = (item: SearchResult) => {
    setSelected(item)
    api
      .get('/packages', { params: { nomenclature_id: item.id, limit: 100 } })
      .then((r) => setPackages(sortByFefo(r.data.items)))
      .catch(() => setPackages([]))
  }

  return (
    <Stack spacing={2}>
      <TextField label="Search reagents & consumables" value={q} onChange={(e) => setQ(e.target.value)} autoFocus fullWidth />
      {q.length === 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <Box>
            <Typography fontWeight={700} gutterBottom>🔥 Frequently used (lab-wide)</Typography>
            {frequent.common.map((f) => (
              <Chip key={f.nomenclature_id} label={`${f.name} (${f.uses})`} sx={{ m: 0.25 }} onClick={() => setQ(f.name)} />
            ))}
          </Box>
          <Box>
            <Typography fontWeight={700} gutterBottom>👤 My recent usage</Typography>
            {frequent.personal.map((f) => (
              <Chip key={f.nomenclature_id} label={`${f.name} (${f.uses})`} sx={{ m: 0.25 }} onClick={() => setQ(f.name)} />
            ))}
          </Box>
        </Box>
      )}

      {results.length > 0 && (
        <TextField select size="small" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ maxWidth: 260 }}>
          <MenuItem value="">All categories</MenuItem>
          {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
      )}

      <Stack spacing={1}>
        {filtered.map((r) => (
          <Box key={r.id} onClick={() => loadPackages(r)}
            sx={{ p: 1.5, border: '1px solid', borderColor: selected?.id === r.id ? 'primary.main' : 'divider', borderRadius: 2, cursor: 'pointer' }}>
            <Typography fontWeight={700}>{r.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {r.category} · {r.unit}{r.cas_number ? ` · CAS ${r.cas_number}` : ''} · available: {r.packages_available} pkgs
              {r.total_amount > 0 ? ` (${r.total_amount} ${r.unit})` : ''}
            </Typography>
          </Box>
        ))}
      </Stack>

      {selected && (
        <Stack spacing={1}>
          <Typography fontWeight={700}>Packages of «{selected.name}» (FEFO — nearest expiry first)</Typography>
          {packages.length === 0 && <Typography variant="body2" color="text.secondary">No packages.</Typography>}
          {packages.map((p) => (
            <PackageCard key={p.id} pkg={p} currentUserId={user?.id} onUpdated={() => loadPackages(selected)} />
          ))}
        </Stack>
      )}
    </Stack>
  )
}