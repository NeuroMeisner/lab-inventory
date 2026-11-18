import { useEffect, useRef, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, Paper, Stack, TextField, Typography,
} from '@mui/material'
import FlashOnIcon from '@mui/icons-material/FlashOn'
import CloseIcon from '@mui/icons-material/Close'
import KeyboardIcon from '@mui/icons-material/Keyboard'
import {
  BarcodeFormat, BrowserMultiFormatReader, DecodeHintType, type IScannerControls,
} from '@zxing/library'
import { successFeedback } from '../utils/sound'

interface Props {
  onResult: (text: string) => void
  onCancel?: () => void
  hint?: string
  /** Какие коды считать «своими». Чужие тихо игнорируются. */
  accept?: (text: string) => boolean
  /** Пока true — сканер не реагирует (поверх открыт диалог). */
  paused?: boolean
  /** Смена значения разблокирует сканер БЕЗ пересоздания камеры. */
  resetSignal?: number
}

const isInventoryCode = (text: string): boolean => {
  const s = text.trim()
  return (
    /^LOC:/i.test(s) ||
    /\(01\)\d{8,14}/.test(s) ||
    /\(21\)\d{1,6}/.test(s) ||
    /^(?:PKG-)?\d{1,6}$/i.test(s)
  )
}

export default function Scanner({ onResult, onCancel, hint, accept, paused, resetSignal = 0 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const doneRef = useRef(false)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const acceptRef = useRef(accept)
  acceptRef.current = accept
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const lastTextRef = useRef<{ text: string; at: number } | null>(null)
  const resetTimerRef = useRef<number | null>(null)
  const fireTimerRef = useRef<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [torch, setTorch] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualText, setManualText] = useState('')

  const unlock = () => {
    doneRef.current = false
    lastTextRef.current = null
    setFlash(false)
    if (resetTimerRef.current) { window.clearTimeout(resetTimerRef.current); resetTimerRef.current = null }
    if (fireTimerRef.current) { window.clearTimeout(fireTimerRef.current); fireTimerRef.current = null }
  }

  // Разблокировка по сигналу родителя и при снятии паузы — камера НЕ пересоздаётся
  useEffect(() => { unlock() }, [resetSignal])
  useEffect(() => { if (!paused) unlock() }, [paused])

  const fire = (text: string, delay: number) => {
    doneRef.current = true
    successFeedback()
    setFlash(true)
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => {
      doneRef.current = false
      setFlash(false)
    }, 2200)
    if (fireTimerRef.current) window.clearTimeout(fireTimerRef.current)
    fireTimerRef.current = window.setTimeout(() => onResultRef.current(text), delay)
  }

  useEffect(() => {
    let cancelled = false
    let localControls: IScannerControls | null = null
    let retryTimer: number | null = null
    doneRef.current = false

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX])
    const reader = new BrowserMultiFormatReader(hints, 250)

    const start = async (attempt = 0) => {
      if (cancelled || !videoRef.current) return
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result) => {
            if (cancelled || !result || doneRef.current || pausedRef.current) return
            const text = result.getText()
            const predicate = acceptRef.current ?? isInventoryCode
            if (!predicate(text)) return
            const now = Date.now()
            if (lastTextRef.current && lastTextRef.current.text === text && now - lastTextRef.current.at < 2500) return
            lastTextRef.current = { text, at: now }
            fire(text, 250)
          },
        )
        if (cancelled) { controls.stop(); return }
        localControls = controls
        controlsRef.current = controls
        setError(null)
      } catch (err: any) {
        if (cancelled) return
        // Устройство ещё освобождается после предыдущего сканера — пробуем снова
        if (attempt < 3) {
          retryTimer = window.setTimeout(() => start(attempt + 1), 450)
        } else {
          setError(`Camera unavailable: ${err?.message ?? err}`)
        }
      }
    }
    start()

    return () => {
      cancelled = true
      if (retryTimer) window.clearTimeout(retryTimer)
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
      if (fireTimerRef.current) window.clearTimeout(fireTimerRef.current)
      try { localControls?.stop() } catch { /* уже остановлен */ }
      controlsRef.current = null
      const stream = videoRef.current?.srcObject as MediaStream | null
      stream?.getTracks().forEach((t) => t.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleTorch = async () => {
    try {
      await controlsRef.current?.switchTorch?.(!torch)
      setTorch(!torch)
    } catch { /* вспышка не поддерживается */ }
  }

  const submitManual = () => {
    const text = manualText.trim()
    if (!text) return
    setManualOpen(false)
    setManualText('')
    fire(text, 150)
  }

  return (
    <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden', bgcolor: '#111' }}>
      <Box sx={{ position: 'relative', width: '100%', aspectRatio: '3 / 4', maxHeight: '58vh', bgcolor: 'black', overflow: 'hidden' }}>
        {error ? (
          <Box sx={{ position: 'absolute', inset: 0, p: 3, color: 'white', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Typography>{error}</Typography>
            <Typography variant="body2" sx={{ mt: 1, opacity: 0.7 }}>
              Camera access requires HTTPS (or localhost). You can enter the code manually below.
            </Typography>
          </Box>
        ) : (
          <video
            ref={videoRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            muted
            playsInline
          />
        )}

        {!error && (
          <Box
            sx={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '64%', maxWidth: 300, aspectRatio: '1 / 1',
              border: `3px solid ${flash ? '#00e676' : '#ffffffaa'}`,
              borderRadius: 2, pointerEvents: 'none', transition: 'border-color 0.2s',
            }}
          />
        )}

        {hint && (
          <Typography variant="body2" sx={{ position: 'absolute', top: 8, left: 8, maxWidth: 'calc(100% - 16px)', color: 'white', bgcolor: '#0008', px: 1, py: 0.25, borderRadius: 1 }}>
            {hint}
          </Typography>
        )}

        {!error && !flash && (
          <Typography variant="caption" sx={{ position: 'absolute', bottom: 8, left: 8, right: 8, textAlign: 'center', color: 'white', bgcolor: '#0008', py: 0.5, borderRadius: 1 }}>
            Point the camera at the DataMatrix / QR code
          </Typography>
        )}
      </Box>

      <Stack direction="row" spacing={1} useFlexGap sx={{ p: 1, flexWrap: 'wrap', pb: 'max(8px, env(safe-area-inset-bottom))' }}>
        <Button variant="outlined" size="large" sx={{ color: 'white', borderColor: '#555', flex: 1, minWidth: 110 }} onClick={toggleTorch} startIcon={<FlashOnIcon />}>
          Torch
        </Button>
        <Button variant="outlined" size="large" sx={{ color: 'white', borderColor: '#555', flex: 1, minWidth: 110 }} onClick={() => setManualOpen(true)} startIcon={<KeyboardIcon />}>
          Manual
        </Button>
        {onCancel && (
          <Button variant="outlined" size="large" color="error" sx={{ flex: 1, minWidth: 110 }} onClick={onCancel} startIcon={<CloseIcon />}>
            Cancel
          </Button>
        )}
      </Stack>

      <Dialog open={manualOpen} onClose={() => setManualOpen(false)} fullWidth>
        <DialogTitle>Enter code manually</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">Type the package ID (e.g. 2 or 00002), or paste the full DataMatrix / QR content.</Alert>
            <TextField
              autoFocus fullWidth label="Code" value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitManual() }}
              inputProps={{ inputMode: 'text', autoComplete: 'off' }}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="large" fullWidth disabled={!manualText.trim()} onClick={submitManual}>Submit</Button>
              <Button size="large" onClick={() => setManualOpen(false)}>Cancel</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Paper>
  )
}