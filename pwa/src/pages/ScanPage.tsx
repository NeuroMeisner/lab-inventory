import { useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, Divider, IconButton, Stack,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useNavigate } from 'react-router-dom'
import { api, errorDetail } from '../api/client'
import type { PackageInfo } from '../api/types'
import Scanner from '../components/Scanner'
import { parseDatamatrix, parseLocationQr } from '../utils/gs1'
import { useWriteOffSession } from '../store/writeOffSession'

export default function ScanPage() {
  const navigate = useNavigate()
  const [resetSignal, setResetSignal] = useState(0)
  const [pendingLocation, setPendingLocation] = useState<string | null>(null)
  const [zone, setZone] = useState<'storage' | 'in_use'>('storage')
  const [movePkg, setMovePkg] = useState<PackageInfo | null>(null)
  const [sheetPkg, setSheetPkg] = useState<PackageInfo | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageSeverity, setMessageSeverity] = useState<'success' | 'error'>('success')
  const sessionCount = useWriteOffSession((s) => s.items.length)

  const restartScanner = () => setResetSignal((k) => k + 1)

  const showMsg = (text: string, sev: 'success' | 'error' = 'success') => {
    setMessage(text)
    setMessageSeverity(sev)
  }

  const exitPlacementMode = () => {
    setPendingLocation(null)
    restartScanner()
  }

  const onResult = async (text: string) => {
    setMessage(null)
    const loc = parseLocationQr(text)
    if (loc) {
      if (pendingLocation && loc === pendingLocation) {
        showMsg(`Location ${loc} is already the target. Scan a package to place it here.`)
      } else {
        showMsg(`Target location: ${loc}. Now scan a package.`)
      }
      setPendingLocation(loc)
      setZone(loc.startsWith('S-') ? 'storage' : 'in_use')
      restartScanner()
      return
    }
    const ref = parseDatamatrix(text)
    if (!ref.packageId) {
      showMsg('Code not recognized as a package', 'error')
      restartScanner()
      return
    }
    try {
      const { data } = await api.get(`/packages/${ref.packageId}`)
      if (pendingLocation) setMovePkg(data)
      else setSheetPkg(data)
    } catch (err) {
      showMsg(errorDetail(err), 'error')
      restartScanner()
    }
  }

  const sameSpot = !!movePkg && !!pendingLocation
    && movePkg.location === pendingLocation
    && movePkg.zone === zone
    && movePkg.placement_status === 'placed'

  const confirmMove = async () => {
    if (!movePkg || !pendingLocation || sameSpot) return
    try {
      await api.put(`/packages/${movePkg.id}/location`, { location: pendingLocation, zone })
      showMsg(`${movePkg.display_code} → ${pendingLocation}. Scan the next package.`)
      setMovePkg(null)
      restartScanner()
    } catch (err) {
      showMsg(errorDetail(err), 'error')
      setMovePkg(null)
      restartScanner()
    }
  }

  const closeSheet = () => { setSheetPkg(null); restartScanner() }
  const closeMove = () => { setMovePkg(null); restartScanner() }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Scanner</Typography>

      {pendingLocation && (
        <Alert severity="info" action={<Button color="inherit" size="large" onClick={exitPlacementMode}>Exit</Button>}>
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
        hint={pendingLocation ? `Scan package → ${pendingLocation}` : 'Scan a package or a location QR'}
        onResult={onResult}
        onCancel={pendingLocation ? exitPlacementMode : undefined}
        paused={!!sheetPkg || !!movePkg}
        resetSignal={resetSignal}
      />

      {message && <Alert severity={messageSeverity} onClose={() => setMessage(null)}>{message}</Alert>}

      <Dialog open={!!sheetPkg} onClose={closeSheet} fullWidth maxWidth="sm">
        {sheetPkg && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pb: 0.5 }}>
              <Box>
                {sheetPkg.display_code}
                <Typography variant="body2" color="text.secondary" component="div">{sheetPkg.nomenclature_name}</Typography>
              </Box>
              <IconButton onClick={closeSheet} aria-label="close" size="small"><CloseIcon /></IconButton>
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

              {sheetPkg.opened_at != null && sheetPkg.zone === 'in_use' ? (
                <Stack spacing={1.5}>
                  <Button variant="contained" size="large" fullWidth onClick={() => navigate(`/package/${sheetPkg.id}?action=write-off`)}>
                    Write off now
                  </Button>
                  <Button variant="outlined" size="large" fullWidth onClick={() => navigate(`/write-off-batch?pkg=${sheetPkg.id}`)}>
                    Add to mass write-off{sessionCount > 0 ? ` (session: ${sessionCount})` : ''}
                  </Button>
                </Stack>
              ) : (
                <Alert severity="info">
                  {sheetPkg.opened_at == null
                    ? 'Package is sealed — open it and place it in the in-use zone before write-off.'
                    : 'Package is in storage — move it to the in-use zone before write-off.'}
                </Alert>
              )}

              <Divider sx={{ my: 2 }} />

              <Stack spacing={1}>
                {sheetPkg.opened_at == null && (
                  <Button size="large" fullWidth onClick={() => navigate(`/package/${sheetPkg.id}?action=open`)}>Open package</Button>
                )}
                <Button size="large" fullWidth onClick={() => navigate(`/package/${sheetPkg.id}?action=move`)}>Move to another location</Button>
                <Button size="large" fullWidth onClick={() => navigate(`/package/${sheetPkg.id}?action=details`)}>Details</Button>
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>

      <Dialog open={!!movePkg && !!pendingLocation} onClose={closeMove} fullWidth maxWidth="sm">
        {movePkg && pendingLocation && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {movePkg.placement_status === 'pending' ? 'Place' : 'Move'} {movePkg.display_code}
              <IconButton onClick={closeMove} aria-label="close" size="small"><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent>
              <Typography sx={{ mb: 2 }}>
                <b>{movePkg.location ?? '(not placed)'}</b> → <b>{pendingLocation}</b>
              </Typography>

              {sameSpot && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  This package is already at <b>{pendingLocation}</b> in this zone. Scan a different location to move it.
                </Alert>
              )}

              <ToggleButtonGroup exclusive value={zone} onChange={(_, v) => v && setZone(v)} sx={{ mb: 2 }}>
                <ToggleButton value="storage">Storage</ToggleButton>
                <ToggleButton value="in_use">In use</ToggleButton>
              </ToggleButtonGroup>

              <Stack direction="row" spacing={1}>
                <Button variant="contained" size="large" sx={{ flex: 1 }} disabled={sameSpot} onClick={confirmMove}>
                  {sameSpot ? 'Already here' : 'Confirm'}
                </Button>
                <Button size="large" onClick={closeMove}>{sameSpot ? 'Scan another location' : 'Skip'}</Button>
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Stack>
  )
}