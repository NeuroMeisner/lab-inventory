import { useEffect, useRef, useState } from 'react'
import { Box, Button, Paper, Typography } from '@mui/material'
import FlashOnIcon from '@mui/icons-material/FlashOn'
import CloseIcon from '@mui/icons-material/Close'
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

  return (
    <Paper sx={{ p: 1, position: 'relative', bgcolor: 'black', borderRadius: 2, overflow: 'hidden' }}>
      {error ? (
        <Box sx={{ p: 3, bgcolor: '#111', color: 'white', textAlign: 'center' }}>
          <Typography>{error}</Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.7 }}>
            Camera access requires HTTPS (or localhost).
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
        <Typography sx={{ position: 'absolute', top: 8, left: 8, color: 'white', bgcolor: '#0008', px: 1, borderRadius: 1 }} variant="body2">
          {hint}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, p: 1, bgcolor: '#111' }}>
        <Button variant="outlined" size="small" sx={{ color: 'white', borderColor: '#555' }} onClick={toggleTorch} startIcon={<FlashOnIcon />}>
          Torch
        </Button>
        {onCancel && (
          <Button variant="outlined" size="small" color="error" onClick={onCancel} startIcon={<CloseIcon />}>
            Cancel
          </Button>
        )}
      </Box>
    </Paper>
  )
}