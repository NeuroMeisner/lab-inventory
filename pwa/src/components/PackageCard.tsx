import { Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import type { PackageInfo } from '../api/types'
import { api } from '../api/client'
import { isExpired } from '../utils/fefo'

interface Props {
  pkg: PackageInfo
  onUpdated?: () => void
  currentUserId?: number
}

export default function PackageCard({ pkg, onUpdated, currentUserId }: Props) {
  const navigate = useNavigate()
  const expired = isExpired(pkg)
  const reservedByMe = pkg.reserved_by_id != null && pkg.reserved_by_id === currentUserId
  const reservedByOther = pkg.reserved_by_id != null && pkg.reserved_by_id !== currentUserId

  const toggleReserve = async () => {
    if (reservedByMe) await api.delete(`/packages/${pkg.id}/reserve`)
    else await api.put(`/packages/${pkg.id}/reserve`)
    onUpdated?.()
  }

  const amountText =
    pkg.current_amount != null
      ? `${pkg.current_amount} / ${pkg.nominal_amount ?? '?'} ${pkg.unit ?? ''}`
      : `${pkg.nominal_amount ?? ''} ${pkg.unit ?? ''}`

  return (
    <Card variant="outlined" sx={{ opacity: expired ? 0.75 : 1 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography fontWeight={700}>{pkg.nomenclature_name}</Typography>
          <Typography variant="caption">{pkg.display_code}</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {amountText} · Batch {pkg.batch_number ?? '—'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {pkg.location ?? 'Not placed'} · {pkg.zone === 'storage' ? 'Storage' : 'In use'}
          {pkg.grant_code ? ` · ${pkg.grant_code} (${pkg.grant_manager ?? ''})` : ''}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
          {pkg.expiry_date && (
            <Chip size="small" label={`Exp ${pkg.expiry_date}`} color={expired ? 'error' : undefined} />
          )}
          {pkg.placement_status === 'pending' && <Chip size="small" label="Pending placement" color="warning" />}
          {!pkg.opened_at && pkg.placement_status === 'placed' && <Chip size="small" label="Sealed" />}
          {reservedByMe && <Chip size="small" color="success" label="Reserved by you" />}
          {reservedByOther && (
            <Chip size="small" color="warning" label={`Reserved by ${pkg.reserved_by_name ?? '…'} until ${new Date(pkg.reserved_until!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`} />
          )}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Button size="small" onClick={() => navigate(`/package/${pkg.id}?action=details`)}>Details</Button>
          <Button size="small" variant="contained" onClick={() => navigate(`/package/${pkg.id}?action=write-off`)}>Write off</Button>
          {pkg.opened_at == null && (
            <Button size="small" onClick={() => navigate(`/package/${pkg.id}?action=open`)}>Open</Button>
          )}
          <Button size="small" onClick={() => navigate(`/package/${pkg.id}?action=move`)}>Move</Button>
          <Button size="small" onClick={toggleReserve}>{reservedByMe ? 'Cancel reserve' : 'Reserve'}</Button>
        </Stack>
      </CardContent>
    </Card>
  )
}