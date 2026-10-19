import { useState } from 'react'
import { Alert, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
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
  const [zone, setZone] = useState<'storage' | 'in_use'>(pkg.location?.startsWith('S-') ? 'storage' : 'in_use')
  const [message, setMessage] = useState<string | null>(null)

  const confirm = async () => {
    try {
      await api.put(`/packages/${pkg.id}/location`, { location, zone })
      setMessage(`✅ Moved to ${location}`)
      onDone?.()
    } catch (err) {
      setMessage(`❌ ${errorDetail(err)}`)
    }
  }

  if (!location) {
    return (
      <Stack spacing={2}>
        <Typography>Scan the QR code of the destination location.</Typography>
        <Scanner
          hint="Scan location QR (LOC:...)"
          onResult={(text) => {
            const loc = parseLocationQr(text)
            if (loc) {
              setLocation(loc)
              setZone(loc.startsWith('S-') ? 'storage' : 'in_use')
            } else setMessage('❌ This is not a location QR (expected LOC:...)')
          }}
        />
        {message && <Alert severity="error">{message}</Alert>}
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h6">{pkg.placement_status === 'pending' ? 'Place' : 'Move'} package</Typography>
      <Typography>
        <b>{pkg.location ?? 'Not placed yet'}</b> → <b>{location}</b>
      </Typography>
      <ToggleButtonGroup exclusive size="small" value={zone} onChange={(_, v) => v && setZone(v)}>
        <ToggleButton value="storage">Storage (warehouse)</ToggleButton>
        <ToggleButton value="in_use">In use (lab room)</ToggleButton>
      </ToggleButtonGroup>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={confirm}>Confirm</Button>
        <Button onClick={() => { setLocation(null); setMessage(null) }}>Rescan</Button>
      </Stack>
      {message && <Alert severity={message.startsWith('❌') ? 'error' : 'success'}>{message}</Alert>}
    </Stack>
  )
}