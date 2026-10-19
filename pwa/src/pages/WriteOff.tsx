import { useEffect, useState } from 'react'
import { Alert, Stack, Typography } from '@mui/material'
import { api, errorDetail } from '../api/client'
import type { Grant, PackageInfo } from '../api/types'
import Scanner from '../components/Scanner'
import WriteOffPanel from '../components/WriteOffPanel'
import { parseDatamatrix } from '../utils/gs1'

export default function WriteOff() {
  const [pkg, setPkg] = useState<PackageInfo | null>(null)
  const [grants, setGrants] = useState<Grant[]>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => { api.get('/grants').then((r) => setGrants(r.data)).catch(() => {}) }, [])

  if (pkg) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>📝 Write off — {pkg.display_code}</Typography>
        <Typography>{pkg.nomenclature_name} · {pkg.location ?? 'not placed'}</Typography>
        <WriteOffPanel pkg={pkg} grants={grants} />
        <Typography sx={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setPkg(null)}>
          ← Scan another package
        </Typography>
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>📝 Write off</Typography>
      <Typography>Scan the package DataMatrix.</Typography>
      <Scanner
        hint="Scan package DataMatrix"
        onResult={async (text) => {
          const ref = parseDatamatrix(text)
          if (!ref.packageId) { setMessage('❌ Not a package DataMatrix'); return }
          try {
            const { data } = await api.get(`/packages/${ref.packageId}`)
            setPkg(data)
          } catch (err) { setMessage(`❌ ${errorDetail(err)}`) }
        }}
      />
      {message && <Alert severity="error">{message}</Alert>}
    </Stack>
  )
}