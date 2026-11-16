import { useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, Divider, Stack,
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
      setMessage('Code not recognized as a package')
      restartScanner()
      return
    }
    try {
      const { data } = await api.get(`/packages/${ref.packageId}`)
      if (pendingLocation) setMovePkg(data)
      else setSheetPkg(data)
    } catch (err) {
      setMessage(errorDetail(err))
      restartScanner()
    }
  }

  const confirmMove = async () => {
    if (!movePkg || !pendingLocation) return
    try {
      await api.put(`/packages/${movePkg.id}/location`, { location: pendingLocation, zone })
      setMessage(`${movePkg.display_code} → ${pendingLocation}. Scan the next package.`)
      setMovePkg(null)
      restartScanner()
    } catch (err) {
      setMessage(errorDetail(err))
    }
  }

  const closeSheet = () => {
    setSheetPkg(null)
    restartScanner()
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Scanner</Typography>

      {pendingLocation && (
        <Alert
          severity="info"
          action={<Button color="inherit" size="large" onClick={() => setPendingLocation(null)}>Exit</Button>}
        >
          Placement mode: scanned packages will be placed at <b>{pendingLocation}</b>.
          <Box sx={{ mt: 1 }}>
            <ToggleButtonGroup exclusive value={zone} onChange={(_, v) => v && setZone(v)}>
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
        onCancel={pendingLocation ? () => setPendingLocation(null) : undefined}
      />

      {message && <Alert severity={message.startsWith('❌') ? 'error' : 'success'} onClose={() => setMessage(null)}>{message}</Alert>}

      {/* Карточка упаковки после скана: Write off — главное действие */}
      <Dialog open={!!sheetPkg} onClose={closeSheet} fullWidth maxWidth="sm">
        {sheetPkg && (
          <>
            <DialogTitle sx={{ pb: 0.5 }}>
              {sheetPkg.display_code}
              <Typography variant="body2" color="text.secondary" component="div">
                {sheetPkg.nomenclature_name}
              </Typography>
            </DialogTitle>
            <DialogContent>
              <Stack spacing={1.5} sx={{ mb: 2 }}>
                <Typography variant="body1">
                  <b>{sheetPkg.current_amount ?? '—'} {sheetPkg.unit ?? ''}</b>
                  {sheetPkg.nominal_amount != null ? ` / ${sheetPkg.nominal_amount} ${sheetPkg.unit ?? ''}` : ''}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {sheetPkg.location ?? 'not placed'} · {sheetPkg.zone === 'storage' ? 'Storage' : 'In use'}
                  {sheetPkg.grant_code ? ` · ${sheetPkg.grant_code}` : ''}
                </Typography>
              </Stack>

              <Stack spacing={1.5}>
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  onClick={() => navigate(`/package/${sheetPkg.id}?action=write-off`)}
                >
                  Write off now
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  fullWidth
                  onClick={() => navigate(`/write-off-batch?pkg=${sheetPkg.id}`)}
                >
                  Add to mass write-off{sessionCount > 0 ? ` (session: ${sessionCount})` : ''}
                </Button>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Stack spacing={1}>
                {sheetPkg.opened_at == null && (
                  <Button size="large" fullWidth onClick={() => navigate(`/package/${sheetPkg.id}?action=open`)}>
                    Open package
                  </Button>
                )}
                <Button size="large" fullWidth onClick={() => navigate(`/package/${sheetPkg.id}?action=move`)}>
                  Move to another location
                </Button>
                <Button size="large" fullWidth onClick={() => navigate(`/package/${sheetPkg.id}?action=details`)}>
                  Details
                </Button>
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>

      {/* Подтверждение перемещения */}
      <Dialog open={!!movePkg} onClose={() => { setMovePkg(null); restartScanner() }} fullWidth maxWidth="sm">
        {movePkg && pendingLocation && (
          <>
            <DialogTitle>
              {movePkg.placement_status === 'pending' ? 'Place' : 'Move'} {movePkg.display_code}
            </DialogTitle>
            <DialogContent>
              <Typography sx={{ mb: 2 }}>
                <b>{movePkg.location ?? '(not placed)'}</b> → <b>{pendingLocation}</b>
              </Typography>
              <ToggleButtonGroup exclusive value={zone} onChange={(_, v) => v && setZone(v)} sx={{ mb: 2 }}>
                <ToggleButton value="storage">Storage</ToggleButton>
                <ToggleButton value="in_use">In use</ToggleButton>
              </ToggleButtonGroup>
              <Stack direction="row" spacing={1}>
                <Button variant="contained" size="large" sx={{ flex: 1 }} onClick={confirmMove}>Confirm</Button>
                <Button size="large" onClick={() => { setMovePkg(null); restartScanner() }}>Skip</Button>
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Stack>
  )
}