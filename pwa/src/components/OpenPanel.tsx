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

export default function OpenPanel({ pkg, onDone }: Props) {
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (pkg.opened_at) {
    return <Alert severity="warning">Package was already opened at {new Date(pkg.opened_at).toLocaleString()}.</Alert>
  }

  if (!confirmed) {
    return (
      <Stack spacing={2}>
        <Typography>Open package <b>{pkg.display_code}</b> ({pkg.nomenclature_name})?</Typography>
        <Button variant="contained" size="large" fullWidth onClick={() => setConfirmed(true)}>
          Confirm opening
        </Button>
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Typography>Now scan the QR of the new location in the active zone (where the opened package will live).</Typography>
      <Scanner
        hint="Scan new location QR"
        onResult={async (text) => {
          const loc = parseLocationQr(text)
          if (!loc) {
            setMessage('This is not a location QR (expected LOC:...)')
            return
          }
          try {
            await api.put(`/packages/${pkg.id}/open`, { location: loc, zone: 'in_use' })
            setMessage(`Package opened and placed at ${loc}`)
            onDone?.()
          } catch (err) {
            setMessage(errorDetail(err))
          }
        }}
        onCancel={() => setConfirmed(false)}
      />
      {message && <Alert severity={message.startsWith('This') ? 'error' : 'success'}>{message}</Alert>}
    </Stack>
  )
}