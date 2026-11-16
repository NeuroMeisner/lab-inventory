import { useEffect, useRef, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, Paper, Stack, TextField, Typography,
} from '@mui/material'
import FlashOnIcon from '@mui/icons-material/FlashOn'
import CloseIcon from '@mui/icons-material/Close'
import KeyboardIcon from '@mui/icons-material/Keyboard'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/library'
import { successFeedback } from '../utils/sound'

interface Props {
  onResult: (text: string) => void
  onCancel?: () => void
  hint?: string
}

export default function Scanner({ onResult, onCancel, hint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const doneRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [torch, setTorch] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualText, setManualText] = useState('')

  useEffect(() => {
    doneRef.current = false
    const reader = new BrowserMultiFormatReader()
    reader
      .decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current!, (result) => {
        if (result && !doneRef.current) {
          doneRef.current = true
          successFeedback()
          setFlash(true)
          setTimeout(() => onResult(result.getText()), 300)
        }
      })
      .then((controls) => {
        controlsRef.current = controls
      })
      .catch((err) => setError(`Camera unavailable: ${err?.message ?? err}`))
    return () => controlsRef.current?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleTorch = async () => {
    try {
      await controlsRef.current?.switchTorch?.(!torch)
      setTorch(!torch)
    } catch {
      /* вспышка не поддерживается */
    }
  }

  const submitManual = () => {
    const text = manualText.trim()
    if (!text) return
    setManualOpen(false)
    setManualText('')
    successFeedback()
    setFlash(true)
    setTimeout(() => onResult(text), 200)
  }

  return (
    <Paper sx={{ p: 1, position: 'relative', bgcolor: 'black', borderRadius: 2, overflow: 'hidden' }}>
      {error ? (
        <Box sx={{ p: 3, bgcolor: '#111', color: 'white', textAlign: 'center' }}>
          <Typography>{error}</Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.7 }}>
            Camera access requires HTTPS (or localhost). You can enter the code manually below.
          </Typography>
        </Box>
      ) : (
        <video ref={videoRef} style={{ width: '100%', display: 'block' }} muted playsInline />
      )}

      {/* Рамка позиционирования */}
      <Box
        sx={{
          position: 'absolute', inset: '20%', border: `3px solid ${flash ? '#00e676' : '#ffffffaa'}`,
          borderRadius: 2, pointerEvents: 'none', transition: 'border-color 0.2s',
        }}
      />

      {hint && (
        <Typography
          sx={{ position: 'absolute', top: 8, left: 8, color: 'white', bgcolor: '#0008', px: 1, borderRadius: 1 }}
          variant="body2"
        >
          {hint}
        </Typography>
      )}

      {!error && !flash && (
        <Typography
          sx={{ position: 'absolute', bottom: 72, left: 0, right: 0, textAlign: 'center', color: 'white', bgcolor: '#0008', py: 0.5 }}
          variant="caption"
        >
          Point the camera at the DataMatrix / QR code
        </Typography>
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{ p: 1, bgcolor: '#111', pb: 'max(8px, env(safe-area-inset-bottom))' }}
      >
        <Button
          variant="outlined"
          size="large"
          sx={{ color: 'white', borderColor: '#555', flex: 1 }}
          onClick={toggleTorch}
          startIcon={<FlashOnIcon />}
        >
          Torch
        </Button>
        <Button
          variant="outlined"
          size="large"
          sx={{ color: 'white', borderColor: '#555', flex: 1 }}
          onClick={() => setManualOpen(true)}
          startIcon={<KeyboardIcon />}
        >
          Enter manually
        </Button>
        {onCancel && (
          <Button
            variant="outlined"
            size="large"
            color="error"
            sx={{ flex: 1 }}
            onClick={onCancel}
            startIcon={<CloseIcon />}
          >
            Cancel
          </Button>
        )}
      </Stack>

      <Dialog open={manualOpen} onClose={() => setManualOpen(false)} fullWidth>
        <DialogTitle>Enter code manually</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              Type the package ID or paste the full DataMatrix / QR content.
            </Alert>
            <TextField
              autoFocus
              fullWidth
              label="Code"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitManual() }}
              inputProps={{ inputMode: 'text', autoComplete: 'off' }}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="large" fullWidth disabled={!manualText.trim()} onClick={submitManual}>
                Submit
              </Button>
              <Button size="large" onClick={() => setManualOpen(false)}>Cancel</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Paper>
  )
}