import { useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
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

  const zone = location?.startsWith('S-') ? 'storage' : 'in_use'

  const confirm = async () => {
    if (!location) return
    try {
      await api.put(`/packages/${pkg.id}/location`, { location, zone })
      setMessage(`Moved to ${location}`)
      onDone?.()
    } catch (err) {
      setMessage(errorDetail(err))
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
            if (loc) setLocation(loc)
            else setMessage('This is not a location QR (expected LOC:...)')
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
      <Typography variant="body2" color="text.secondary">
        Zone (detected): <b>{zone === 'storage' ? 'Storage' : 'In use'}</b>
      </Typography>
      <Stack spacing={1}>
        <Button variant="contained" size="large" fullWidth onClick={confirm}>
          Confirm move
        </Button>
        <Button size="large" fullWidth onClick={() => { setLocation(null); setMessage(null) }}>
          Rescan location
        </Button>
      </Stack>
      {message && <Alert severity={message.startsWith('Moved') ? 'success' : 'error'}>{message}</Alert>}
    </Stack>
  )
}