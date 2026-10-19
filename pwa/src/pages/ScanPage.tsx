import { useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, Stack,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { api, errorDetail } from '../api/client'
import type { PackageInfo } from '../api/types'
import Scanner from '../components/Scanner'
import { parseDatamatrix, parseLocationQr } from '../utils/gs1'
import { useWriteOffSession } from '../store/writeOffSession'

export default function ScanPage() {
  const navigate = useNavigate()
  const [scanKey, setScanKey] = useState(0)
  const [pendingLocation, setPendingLocation] = useState<string | null>(null)
  const [zone, setZone] = useState<'storage' | 'in_use'>('storage')
  const [movePkg, setMovePkg] = useState<PackageInfo | null>(null)
  const [sheetPkg, setSheetPkg] = useState<PackageInfo | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const sessionCount = useWriteOffSession((s) => s.items.length)

  const restartScanner = () => setScanKey((k) => k + 1)

  const onResult = async (text: string) => {
    setMessage(null)
    const loc = parseLocationQr(text)
    if (loc) {
      setPendingLocation(loc)
      setZone(loc.startsWith('S-') ? 'storage' : 'in_use')
      restartScanner()
      return
    }
    const ref = parseDatamatrix(text)
    if (!ref.packageId) {
      setMessage('❌ Code not recognized as a package')
      restartScanner()
      return
    }
    try {
      const { data } = await api.get(`/packages/${ref.packageId}`)
      if (pendingLocation) setMovePkg(data)
      else setSheetPkg(data)
    } catch (err) {
      setMessage(`❌ ${errorDetail(err)}`)
      restartScanner()
    }
  }

  const confirmMove = async () => {
    if (!movePkg || !pendingLocation) return
    try {
      await api.put(`/packages/${movePkg.id}/location`, { location: pendingLocation, zone })
      setMessage(`✅ ${movePkg.display_code} → ${pendingLocation}. Scan the next package.`)
      setMovePkg(null)
      restartScanner()
    } catch (err) {
      setMessage(`❌ ${errorDetail(err)}`)
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>📷 Scanner</Typography>

      {pendingLocation && (
        <Alert
          severity="info"
          action={<Button color="inherit" size="small" onClick={() => setPendingLocation(null)}>Exit</Button>}
        >
          Placement mode: scanned packages will be placed at <b>{pendingLocation}</b>.
          <Box sx={{ mt: 1 }}>
            <ToggleButtonGroup exclusive size="small" value={zone} onChange={(_, v) => v && setZone(v)}>
              <ToggleButton value="storage">Storage</ToggleButton>
              <ToggleButton value="in_use">In use</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Alert>
      )}

      <Scanner
        key={scanKey}
        hint={pendingLocation ? `Scan package → ${pendingLocation}` : 'Scan a package or a location QR'}
        onResult={onResult}
      />

      {message && <Alert severity={message.startsWith('❌') ? 'error' : 'success'}>{message}</Alert>}

      {/* Меню действий для упаковки */}
      <Dialog open={!!sheetPkg} onClose={() => { setSheetPkg(null); restartScanner() }} fullWidth>
        {sheetPkg && (
          <>
            <DialogTitle>
              {sheetPkg.display_code} — {sheetPkg.nomenclature_name}
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {sheetPkg.current_amount ?? '—'} {sheetPkg.unit ?? ''} · {sheetPkg.location ?? 'not placed'} ·{' '}
                {sheetPkg.zone === 'storage' ? 'Storage' : 'In use'}
              </Typography>
              <Stack spacing={1}>
                <Button variant="contained" size="large"
                        onClick={() => navigate(`/write-off-batch?pkg=${sheetPkg.id}`)}>
                  🧾 Add to mass write-off{sessionCount > 0 ? ` (session: ${sessionCount})` : ''}
                </Button>
                <Button variant="outlined" size="large"
                        onClick={() => navigate(`/package/${sheetPkg.id}?action=write-off`)}>
                  📝 Write off now
                </Button>
                {sheetPkg.opened_at == null && (
                  <Button variant="outlined" size="large"
                          onClick={() => navigate(`/package/${sheetPkg.id}?action=open`)}>
                    📦 Open package
                  </Button>
                )}
                <Button variant="outlined" size="large"
                        onClick={() => navigate(`/package/${sheetPkg.id}?action=move`)}>
                  📍 Move to another location
                </Button>
                <Button size="large" onClick={() => navigate(`/package/${sheetPkg.id}?action=details`)}>
                  ℹ️ Details
                </Button>
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>

      {/* Подтверждение перемещения */}
      <Dialog open={!!movePkg} onClose={() => { setMovePkg(null); restartScanner() }} fullWidth>
        {movePkg && pendingLocation && (
          <>
            <DialogTitle>
              {movePkg.placement_status === 'pending' ? 'Place' : 'Move'} {movePkg.display_code}
            </DialogTitle>
            <DialogContent>
              <Typography sx={{ mb: 2 }}>
                <b>{movePkg.location ?? '(not placed)'}</b> → <b>{pendingLocation}</b>
              </Typography>
              <ToggleButtonGroup exclusive size="small" value={zone}
                                 onChange={(_, v) => v && setZone(v)} sx={{ mb: 2 }}>
                <ToggleButton value="storage">Storage</ToggleButton>
                <ToggleButton value="in_use">In use</ToggleButton>
              </ToggleButtonGroup>
              <Stack direction="row" spacing={1}>
                <Button variant="contained" onClick={confirmMove}>Confirm</Button>
                <Button onClick={() => { setMovePkg(null); restartScanner() }}>Skip</Button>
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Stack>
  )
}