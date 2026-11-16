import { useCallback, useEffect, useState } from 'react'
import { Alert, Box, Button, Chip, Divider, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, errorDetail } from '../api/client'
import type { Grant, PackageDetail, TransactionInfo } from '../api/types'
import WriteOffPanel from '../components/WriteOffPanel'
import MovePanel from '../components/MovePanel'
import OpenPanel from '../components/OpenPanel'
import { daysUntilExpiry, isExpired } from '../utils/fefo'
import { useAuthStore } from '../store/auth'

export default function PackageDetails() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const action = params.get('action') ?? 'details'
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [pkg, setPkg] = useState<PackageDetail | null>(null)
  const [txs, setTxs] = useState<TransactionInfo[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [tab, setTab] = useState(action === 'details' ? 0 : 1)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api.get(`/packages/${id}`).then((r) => setPkg(r.data)).catch((e) => setError(errorDetail(e)))
    api.get('/transactions', { params: { package_id: id, limit: 50 } }).then((r) => setTxs(r.data.items)).catch(() => {})
  }, [id])

  useEffect(() => {
    load()
    api.get('/grants').then((r) => setGrants(r.data)).catch(() => {})
  }, [load])

  if (error) return <Alert severity="error">{error}</Alert>
  if (!pkg) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={200} />
      </Stack>
    )
  }

  const expired = isExpired(pkg)
  const days = daysUntilExpiry(pkg)

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">{pkg.nomenclature_name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {pkg.display_code} · {pkg.datamatrix_code}
        </Typography>
      </Box>

      {expired && <Alert severity="error">This package is EXPIRED ({pkg.expiry_date}). Using it is not recommended, but not blocked.</Alert>}
      {!expired && days != null && days <= 30 && <Alert severity="warning">Expiry in {days} day(s): {pkg.expiry_date}</Alert>}

      {/* Ключевые поля крупно */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1.5,
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">Amount</Typography>
          <Typography variant="h6">
            {pkg.current_amount ?? '—'} / {pkg.nominal_amount ?? '—'} {pkg.unit}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Expiry</Typography>
          <Typography variant="h6" color={expired ? 'error.main' : 'text.primary'}>
            {pkg.expiry_date ?? '—'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Location</Typography>
          <Typography variant="h6">{pkg.location ?? 'not placed'}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Grant</Typography>
          <Typography variant="h6">
            {pkg.grant_code ? `${pkg.grant_code} (${pkg.grant_manager})` : '—'}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.5 }}>
        <Typography variant="body2"><b>Batch:</b> {pkg.batch_number ?? '—'}</Typography>
        <Typography variant="body2"><b>Zone:</b> {pkg.zone === 'storage' ? 'Storage' : 'In use'}</Typography>
        <Typography variant="body2">
          <b>Status:</b> {pkg.placement_status}{pkg.opened_at ? `, opened ${new Date(pkg.opened_at).toLocaleDateString()}` : ', sealed'}
        </Typography>
        <Typography variant="body2"><b>Category:</b> {pkg.category ?? '—'}</Typography>
      </Box>

      {pkg.reserved_by_id && (
        <Chip
          color="warning"
          label={`Reserved by ${pkg.reserved_by_name ?? '…'} until ${new Date(pkg.reserved_until!).toLocaleString()}`}
          sx={{ alignSelf: 'flex-start', height: 'auto', py: 1 }}
        />
      )}

      <Divider />

      {/* Главное действие — Write off — наверху, не спрятано под вкладкой */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate(`/package/${pkg.id}?action=write-off`)}
          sx={{ flex: 1, minWidth: 160 }}
        >
          Write off
        </Button>
        {pkg.opened_at == null && (
          <Button size="large" onClick={() => navigate(`/package/${pkg.id}?action=open`)}>Open</Button>
        )}
        <Button size="large" onClick={() => navigate(`/package/${pkg.id}?action=move`)}>Move</Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
        <Tab label="Info" />
        <Tab label="Actions" />
        <Tab label="History" />
      </Tabs>

      {tab === 1 && action === 'write-off' && <WriteOffPanel pkg={pkg} grants={grants} onDone={load} />}
      {tab === 1 && action === 'open' && <OpenPanel pkg={pkg} onDone={load} />}
      {tab === 1 && action === 'move' && <MovePanel pkg={pkg} onDone={load} />}
      {tab === 1 && !['write-off', 'open', 'move'].includes(action) && (
        <Typography variant="body2" color="text.secondary">
          Choose an action above.
        </Typography>
      )}

      {tab === 2 && (
        <Stack spacing={1}>
          {txs.length === 0 && <Typography variant="body2" color="text.secondary">No transactions yet.</Typography>}
          {txs.map((t) => (
            <Box key={t.id} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="body2">
                <b>{t.type}</b>
                {t.amount != null && <> · {t.amount} {pkg.unit}</>}
                {t.from_location && <> · {t.from_location} → {t.to_location}</>}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t.user_name ? `${t.user_name} · ` : ''}{new Date(t.timestamp).toLocaleString()}
                {t.comment ? ` · ${t.comment}` : ''}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  )
}