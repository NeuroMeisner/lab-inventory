import { useState } from 'react'
import { Alert, Button, MenuItem, Select, Snackbar, Stack, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import type { PackageInfo } from '../api/types'
import { api, errorDetail } from '../api/client'
import { useOutboxStore } from '../store/outbox'
import AmountPicker from './AmountPicker'

interface Props {
  pkg: PackageInfo
  grants: { id: number; code: string; manager_name: string }[]
  onDone?: () => void
}

export default function WriteOffPanel({ pkg, grants, onDone }: Props) {
  const navigate = useNavigate()
  const [grantId, setGrantId] = useState<number | ''>('')
  const [message, setMessage] = useState<string | null>(null)
  const [severity, setSeverity] = useState<'success' | 'error' | 'warning' | 'info'>('success')
  const [busy, setBusy] = useState(false)
  const [undo, setUndo] = useState<{ prev: string | number | null; next: string | number | null; amount: string | null } | null>(null)
  const enqueue = useOutboxStore((s) => s.enqueue)

  const grantLabel = pkg.grant_code ? `${pkg.grant_code} (${pkg.grant_manager ?? ''})` : '—'
  const blockedReason = pkg.opened_at == null ? 'sealed' : pkg.zone !== 'in_use' ? 'storage' : null

  const submit = async (value: string | null) => {
    setBusy(true)
    setMessage(null)
    const body = { amount: value, grant_id: grantId === '' ? null : grantId, comment: null }
    const before = pkg.current_amount ?? null
    try {
      if (!navigator.onLine) throw new Error('__offline__')
      const { data } = await api.post(`/packages/${pkg.id}/write-off`, body)
      const after = data.current_amount ?? null
      setSeverity('success')
      setMessage(`Written off${value ? ` ${value} ${pkg.unit ?? ''}` : ''}. ${before ?? '—'} → ${after ?? '—'} ${pkg.unit ?? ''}`)
      setUndo({ prev: before, next: after, amount: value })
      onDone?.()
    } catch (err: any) {
      if (err?.message === '__offline__' || !err?.response) {
        if (pkg.tracking_mode === 'free') {
          setSeverity('info')
          setMessage('Offline, but free-tracked items need no record.')
        } else {
          enqueue({ packageId: pkg.id, packageCode: pkg.display_code, amount: value,
                    grantId: grantId === '' ? null : grantId })
          setSeverity('warning')
          setMessage('You are offline. The write-off was queued and will be sent automatically.')
        }
      } else {
        setSeverity('error')
        setMessage(errorDetail(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const dismissUndo = () => setUndo(null)

  if (blockedReason) {
    return (
      <Stack spacing={2}>
        <Typography variant="body1">Purchase grant: <b>{grantLabel}</b></Typography>
        {blockedReason === 'sealed' ? (
          <>
            <Alert severity="warning">
              This package is <b>sealed</b>. Open it and place it in the in-use zone before writing off.
            </Alert>
            <Button variant="contained" size="large" fullWidth
                    onClick={() => navigate(`/package/${pkg.id}?action=open`)}>
              Open package
            </Button>
          </>
        ) : (
          <>
            <Alert severity="warning">
              This package is in <b>storage</b>. Move it to a working location (in-use zone) before writing off.
            </Alert>
            <Button variant="contained" size="large" fullWidth
                    onClick={() => navigate(`/package/${pkg.id}?action=move`)}>
              Move to in-use zone
            </Button>
          </>
        )}
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body1">
        Purchase grant: <b>{grantLabel}</b>
      </Typography>

      {grants.length > 0 && (
        <Select
          fullWidth
          value={grantId}
          displayEmpty
          onChange={(e) => setGrantId(e.target.value as number | '')}
        >
          <MenuItem value="">Default grant (purchase grant)</MenuItem>
          {grants.map((g) => (
            <MenuItem key={g.id} value={g.id}>{g.code} ({g.manager_name})</MenuItem>
          ))}
        </Select>
      )}

      <AmountPicker
        pkg={pkg}
        onPick={submit}
        disabled={busy}
        freeLabel="Confirm use"
      />

      {pkg.current_amount != null && pkg.tracking_mode !== 'free' && (
        <Typography variant="body2" color="text.secondary">
          Current amount: {pkg.current_amount} {pkg.unit}
        </Typography>
      )}

      {message && <Alert severity={severity}>{message}</Alert>}

      <Snackbar
        open={!!undo}
        autoHideDuration={8000}
        onClose={dismissUndo}
        message={undo ? `Written off: ${undo.prev ?? '—'} → ${undo.next ?? '—'} ${pkg.unit ?? ''}` : ''}
        action={
          <Button color="inherit" size="large" onClick={dismissUndo}>
            OK
          </Button>
        }
      />
    </Stack>
  )
}