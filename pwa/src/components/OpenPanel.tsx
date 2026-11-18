import { useState } from 'react'
import { Alert, Stack, Typography, Button } from '@mui/material'
import type { PackageInfo } from '../api/types'
import { api, errorDetail } from '../api/client'
import Scanner from './Scanner'
import { parseLocationQr } from '../utils/gs1'

interface Props {
  pkg: PackageInfo
  onDone?: () => void
}

export default function OpenPanel({ pkg, onDone }: Props) {
  const [confirmed, setConfirmed] = useState(false)
  const [justOpened, setJustOpened] = useState(false)
  const [openedAtLocation, setOpenedAtLocation] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [severity, setSeverity] = useState<'success' | 'error'>('success')
  const [resetSignal, setResetSignal] = useState(0)

  if (justOpened) {
    return (
      <Stack spacing={2}>
        <Alert severity="success">
          Package <b>{pkg.display_code}</b> opened and placed at <b>{openedAtLocation}</b> (in-use zone).
          You can now write off from it.
        </Alert>
      </Stack>
    )
  }

  if (pkg.opened_at) {
    return <Alert severity="warning">Package was already opened at {new Date(pkg.opened_at).toLocaleString()}.</Alert>
  }

  if (!confirmed) {
    return (
      <Stack spacing={2}>
        <Typography>Open package <b>{pkg.display_code}</b> ({pkg.nomenclature_name})?</Typography>
        <Button variant="contained" size="large" fullWidth onClick={() => setConfirmed(true)}>Confirm opening</Button>
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Typography>Now scan the QR of the new location in the active zone (where the opened package will live).</Typography>
      <Scanner
        hint="Scan new location QR (L...)"
        accept={(t) => !!parseLocationQr(t)}
        resetSignal={resetSignal}
        onResult={async (text) => {
          const loc = parseLocationQr(text)
          if (!loc) {
            setSeverity('error'); setMessage('This is not a location QR (expected LOC:...)')
            setResetSignal((k) => k + 1); return
          }
          if (loc.startsWith('S-')) {
            setSeverity('error'); setMessage('Opened packages must live in the active zone (L...), not storage (S-).')
            setResetSignal((k) => k + 1); return
          }
          try {
            await api.put(`/packages/${pkg.id}/open`, { location: loc, zone: 'in_use' })
            setOpenedAtLocation(loc); setJustOpened(true); onDone?.()
          } catch (err) {
            setSeverity('error'); setMessage(errorDetail(err)); setResetSignal((k) => k + 1)
          }
        }}
        onCancel={() => setConfirmed(false)}
      />
      {message && <Alert severity={severity} onClose={() => setMessage(null)}>{message}</Alert>}
    </Stack>
  )
}