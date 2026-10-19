import { useState } from 'react'
import { Alert, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { api, errorDetail } from '../api/client'
import type { PackageInfo } from '../api/types'
import Scanner from '../components/Scanner'
import { parseDatamatrix, parseLocationQr } from '../utils/gs1'

type Step = 'scan-package' | 'scan-location' | 'confirm'

export default function Relocate() {
  const [step, setStep] = useState<Step>('scan-package')
  const [pkg, setPkg] = useState<PackageInfo | null>(null)
  const [location, setLocation] = useState<string | null>(null)
  const [zone, setZone] = useState<'storage' | 'in_use'>('storage')
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(0)

  const reset = () => { setStep('scan-package'); setPkg(null); setLocation(null); setMessage(null) }

  const onPackageScanned = async (text: string) => {
    const ref = parseDatamatrix(text)
    if (!ref.packageId) { setMessage('❌ Not a package DataMatrix (missing package ID)'); return }
    try {
      const { data } = await api.get(`/packages/${ref.packageId}`)
      setPkg(data)
      setStep('scan-location')
      setMessage(null)
    } catch (err) { setMessage(`❌ ${errorDetail(err)}`) }
  }

  const confirm = async () => {
    if (!pkg || !location) return
    try {
      await api.put(`/packages/${pkg.id}/location`, { location, zone })
      setDone((d) => d + 1)
      setMessage(`✅ ${pkg.display_code} → ${location}. Scan the next package.`)
      reset()
    } catch (err) { setMessage(`❌ ${errorDetail(err)}`) }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>📍 Place / Move packages</Typography>
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
              if (!loc) { setMessage('❌ Not a location QR (expected LOC:...)'); return }
              setLocation(loc)
              setZone(loc.startsWith('S-') ? 'storage' : 'in_use')
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
          <ToggleButtonGroup exclusive size="small" value={zone} onChange={(_, v) => v && setZone(v)}>
            <ToggleButton value="storage">Storage</ToggleButton>
            <ToggleButton value="in_use">In use</ToggleButton>
          </ToggleButtonGroup>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={confirm}>Confirm</Button>
            <Button onClick={() => setStep('scan-location')}>Rescan location</Button>
            <Button onClick={reset}>Cancel</Button>
          </Stack>
        </>
      )}

      {message && <Alert severity={message.startsWith('❌') ? 'error' : 'success'}>{message}</Alert>}
    </Stack>
  )
}