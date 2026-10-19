import { useState } from 'react'
import { Alert, MenuItem, Select, Stack, Typography } from '@mui/material'
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
  const [grantId, setGrantId] = useState<number | ''>('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const enqueue = useOutboxStore((s) => s.enqueue)

  const grantLabel = pkg.grant_code ? `${pkg.grant_code} (${pkg.grant_manager ?? ''})` : '—'

  const submit = async (value: string | null) => {
    setBusy(true)
    setMessage(null)
    const body = { amount: value, grant_id: grantId === '' ? null : grantId, comment: null }
    try {
      if (!navigator.onLine) throw new Error('__offline__')
      const { data } = await api.post(`/packages/${pkg.id}/write-off`, body)
      setMessage(`✅ Written off. Remaining: ${data.current_amount ?? '—'} ${pkg.unit ?? ''}`)
      onDone?.()
    } catch (err: any) {
      if (err?.message === '__offline__' || !err?.response) {
        if (pkg.tracking_mode === 'free') {
          setMessage('Offline, but free-tracked items need no record.')
        } else {
          enqueue({ packageId: pkg.id, packageCode: pkg.display_code, amount: value,
                    grantId: grantId === '' ? null : grantId })
          setMessage('📴 You are offline. The write-off was queued and will be sent automatically.')
        }
      } else {
        setMessage(`❌ ${errorDetail(err)}`)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2">Purchase grant: <b>{grantLabel}</b></Typography>
      {grants.length > 0 && (
        <Select size="small" value={grantId} displayEmpty onChange={(e) => setGrantId(e.target.value as number | '')}>
          <MenuItem value="">Default grant (purchase grant)</MenuItem>
          {grants.map((g) => (
            <MenuItem key={g.id} value={g.id}>{g.code} ({g.manager_name})</MenuItem>
          ))}
        </Select>
      )}
      <AmountPicker pkg={pkg} onPick={submit} disabled={busy}
                    freeLabel="Record a write-off anyway (optional)" />
      {pkg.current_amount != null && pkg.tracking_mode !== 'free' && (
        <Typography variant="body2" color="text.secondary">
          Current amount: {pkg.current_amount} {pkg.unit}
        </Typography>
      )}
      {message && <Alert severity={message.startsWith('❌') ? 'error' : 'success'}>{message}</Alert>}
    </Stack>
  )
}