import { useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { api, errorDetail } from '../api/client'
import type { PackageInfo } from '../api/types'
import Scanner from '../components/Scanner'
import { parseDatamatrix, parseLocationQr } from '../utils/gs1'

type Step = 'scan-package' | 'scan-location' | 'confirm'

export default function Relocate() {
  const [step, setStep] = useState<Step>('scan-package')
  const [pkg, setPkg] = useState<PackageInfo | null>(null)
  const [location, setLocation] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(0)

  const reset = () => { setStep('scan-package'); setPkg(null); setLocation(null); setMessage(null) }

  const zone = location?.startsWith('S-') ? 'storage' : 'in_use'

  const onPackageScanned = async (text: string) => {
    const ref = parseDatamatrix(text)
    if (!ref.packageId) { setMessage('Not a package DataMatrix (missing package ID)'); return }
    try {
      const { data } = await api.get(`/packages/${ref.packageId}`)
      setPkg(data)
      setStep('scan-location')
      setMessage(null)
    } catch (err) { setMessage(errorDetail(err)) }
  }

  const confirm = async () => {
    if (!pkg || !location) return
    try {
      await api.put(`/packages/${pkg.id}/location`, { location, zone })
      setDone((d) => d + 1)
      setMessage(`${pkg.display_code} → ${location}. Scan the next package.`)
      reset()
    } catch (err) { setMessage(errorDetail(err)) }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Place / Move packages</Typography>
      {done > 0 && <Alert severity="success">Processed in this session: {done}</Alert>}

      {step === 'scan-package' && (
        <>
          <Typography>Step 1/3 — scan the package DataMatrix.</Typography>
          <Scanner hint="Scan package DataMatrix" onResult={onPackageScanned} />
        </>
      )}

      {step === 'scan-location' && pkg && (
        <>
          <Typography>
            Step 2/3 — <b>{pkg.display_code}</b> ({pkg.nomenclature_name}), currently: {pkg.location ?? 'not placed'}.
            Scan the destination QR.
          </Typography>
          <Scanner
            hint="Scan location QR (LOC:...)"
            onResult={(text) => {
              const loc = parseLocationQr(text)
              if (!loc) { setMessage('Not a location QR (expected LOC:...)'); return }
              setLocation(loc)
              setStep('confirm')
            }}
            onCancel={reset}
          />
        </>
      )}

      {step === 'confirm' && pkg && location && (
        <>
          <Typography variant="h6">Step 3/3 — confirm</Typography>
          <Typography><b>{pkg.location ?? '(not placed)'}</b> → <b>{location}</b></Typography>
          <Typography variant="body2" color="text.secondary">
            Zone (detected from the location code): <b>{zone === 'storage' ? 'Storage' : 'In use'}</b>
          </Typography>
          <Stack direction="column" spacing={1}>
            <Button variant="contained" size="large" fullWidth onClick={confirm}>
              Confirm placement
            </Button>
            <Button size="large" fullWidth onClick={() => setStep('scan-location')}>
              Rescan location
            </Button>
            <Button size="large" fullWidth onClick={reset}>
              Cancel
            </Button>
          </Stack>
        </>
      )}

      {message && <Alert severity={message.startsWith('Not') ? 'error' : 'success'}>{message}</Alert>}
    </Stack>
  )
}