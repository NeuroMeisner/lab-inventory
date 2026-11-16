import { useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { api, errorDetail } from '../api/client'
import type { PackageInfo } from '../api/types'
import Scanner from '../components/Scanner'
import OpenPanel from '../components/OpenPanel'
import { parseDatamatrix } from '../utils/gs1'

export default function OpenPackage() {
  const [pkg, setPkg] = useState<PackageInfo | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (pkg) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5">Open package</Typography>
        <OpenPanel
          pkg={pkg}
          onDone={() => setMessage('Done. You can scan another package below.')}
        />
        <Button size="large" fullWidth onClick={() => setPkg(null)}>
          Scan another package
        </Button>
        {message && <Alert severity="success">{message}</Alert>}
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Open package</Typography>
      <Typography>Scan the DataMatrix of a sealed package.</Typography>
      <Scanner
        hint="Scan package DataMatrix"
        onResult={async (text) => {
          const ref = parseDatamatrix(text)
          if (!ref.packageId) { setMessage('Not a package DataMatrix'); return }
          try {
            const { data } = await api.get(`/packages/${ref.packageId}`)
            setPkg(data)
            setMessage(null)
          } catch (err) { setMessage(errorDetail(err)) }
        }}
      />
      {message && <Alert severity="error">{message}</Alert>}
    </Stack>
  )
}