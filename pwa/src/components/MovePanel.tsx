import { useState } from 'react'
import { Alert, Button, Chip, Stack, Typography } from '@mui/material'
import type { PackageInfo } from '../api/types'
import { api, errorDetail } from '../api/client'
import Scanner from './Scanner'
import { parseLocationQr } from '../utils/gs1'

interface Props {
  pkg: PackageInfo
  onDone?: () => void
}

export default function MovePanel({ pkg, onDone }: Props) {
  const [location, setLocation] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [severity, setSeverity] = useState<'success' | 'error'>('error')
  const [resetSignal, setResetSignal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [moved, setMoved] = useState<{ to: string; zone: 'storage' | 'in_use'; from: string | null } | null>(null)

  const zone: 'storage' | 'in_use' = location?.startsWith('S-') ? 'storage' : 'in_use'
  const sameSpot =
    !!location && location === pkg.location && zone === pkg.zone && pkg.placement_status === 'placed'

  const reset = () => {
    setLocation(null)
    setMessage(null)
    setMoved(null)
    setResetSignal((k) => k + 1)
  }

  const confirm = async () => {
    if (!location || sameSpot || busy) return
    setBusy(true)
    const from = pkg.location
    try {
      await api.put(`/packages/${pkg.id}/location`, { location, zone })
      setMoved({ to: location, zone, from })
      setMessage(null)
      onDone?.()
    } catch (err) {
      setSeverity('error')
      setMessage(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  // Успешный перенос в этой сессии: показываем успех, а не «already here»
  if (moved) {
    return (
      <Stack spacing={2}>
        <Alert severity="success">
          <b>{pkg.display_code}</b> moved to <b>{moved.to}</b>.
        </Alert>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" label={moved.from ?? 'Not placed'} />
          <Typography variant="body2" color="text.secondary">→</Typography>
          <Chip size="small" color="success" label={moved.to} />
          <Chip size="small" variant="outlined" label={moved.zone === 'storage' ? 'Storage' : 'In use'} />
        </Stack>
        <Button size="large" fullWidth variant="outlined" onClick={reset}>
          Move again
        </Button>
      </Stack>
    )
  }

  if (!location) {
    return (
      <Stack spacing={2}>
        <Typography>Scan the QR code of the destination location.</Typography>
        <Scanner
          hint="Scan location QR (LOC:...)"
          accept={(t) => !!parseLocationQr(t)}
          resetSignal={resetSignal}
          onResult={(text) => {
            const loc = parseLocationQr(text)
            if (loc) {
              setLocation(loc)
              setMessage(null)
            } else {
              setSeverity('error')
              setMessage('This is not a location QR (expected LOC:...)')
              setResetSignal((k) => k + 1)
            }
          }}
        />
        {message && <Alert severity={severity} onClose={() => setMessage(null)}>{message}</Alert>}
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h6">{pkg.placement_status === 'pending' ? 'Place' : 'Move'} package</Typography>
      <Typography><b>{pkg.location ?? 'Not placed yet'}</b> → <b>{location}</b></Typography>
      <Typography variant="body2" color="text.secondary">
        Zone (detected): <b>{zone === 'storage' ? 'Storage' : 'In use'}</b>
      </Typography>

      {sameSpot && (
        <Alert severity="warning">
          This package is already at <b>{location}</b> in this zone. Scan a different location to move it.
        </Alert>
      )}

      <Stack spacing={1}>
        <Button variant="contained" size="large" fullWidth disabled={sameSpot || busy} onClick={confirm}>
          {busy ? 'Moving…' : sameSpot ? 'Already here' : 'Confirm move'}
        </Button>
        <Button size="large" fullWidth onClick={reset}>
          {sameSpot ? 'Scan another location' : 'Rescan location'}
        </Button>
      </Stack>
      {message && <Alert severity={severity} onClose={() => setMessage(null)}>{message}</Alert>}
    </Stack>
  )
}