import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogContent, DialogTitle,
  IconButton, List, ListItem, ListItemText, Stack, Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, errorDetail } from '../api/client'
import type { Grant, PackageInfo } from '../api/types'
import Scanner from '../components/Scanner'
import AmountPicker from '../components/AmountPicker'
import { parseDatamatrix } from '../utils/gs1'
import { useWriteOffSession } from '../store/writeOffSession'
import { useOutboxStore } from '../store/outbox'

interface BatchResult {
  success: number
  failed: { package_id: number; detail: string }[]
}

export default function BatchWriteOff() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const session = useWriteOffSession()
  const [grants, setGrants] = useState<Grant[]>([])
  const [current, setCurrent] = useState<PackageInfo | null>(null)
  const [scanKey, setScanKey] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [messageSeverity, setMessageSeverity] = useState<'success' | 'error' | 'warning' | 'info'>('success')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BatchResult | null>(null)

  useEffect(() => {
    api.get('/grants').then((r) => setGrants(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const pid = params.get('pkg')
    if (pid) {
      api.get(`/packages/${pid}`)
        .then((r) => setCurrent(r.data))
        .catch((err) => { setMessageSeverity('error'); setMessage(errorDetail(err)) })
    }
  }, [params])

  const onScan = async (text: string) => {
    const ref = parseDatamatrix(text)
    if (!ref.packageId) {
      setMessageSeverity('error')
      setMessage('Not a package code')
      setScanKey((k) => k + 1)
      return
    }
    try {
      const { data } = await api.get(`/packages/${ref.packageId}`)
      setCurrent(data)
      setMessage(null)
    } catch (err) {
      setMessageSeverity('error')
      setMessage(errorDetail(err))
      setScanKey((k) => k + 1)
    }
  }

  const addItem = (amount: string | null) => {
    if (!current) return
    session.addItem({
      packageId: current.id,
      displayCode: current.display_code,
      name: current.nomenclature_name ?? '',
      unit: current.unit,
      amount,
      grantId: current.grant_id,
      grantLabel: current.grant_code ? `${current.grant_code} (${current.grant_manager ?? ''})` : null,
    })
    setMessageSeverity('success')
    setMessage(`Added. Session: ${session.items.length + 1} item(s). Scan the next one.`)
    setCurrent(null)
    setScanKey((k) => k + 1)
  }

  const finish = async () => {
    if (session.items.length === 0) return
    setBusy(true)
    setMessage(null)

    if (!navigator.onLine) {
      const enqueue = useOutboxStore.getState().enqueue
      session.items.forEach((i) =>
        enqueue({ packageId: i.packageId, packageCode: i.displayCode, amount: i.amount, grantId: i.grantId }),
      )
      session.clear()
      setMessageSeverity('warning')
      setMessage('You are offline. All items were queued and will be sent automatically.')
      setBusy(false)
      return
    }

    try {
      const { data } = await api.post('/packages/write-off-batch', {
        items: session.items.map((i) => ({
          package_id: i.packageId,
          amount: i.amount,
          grant_id: i.grantId,
          comment: 'Batch write-off',
        })),
      })
      setResult(data)
      session.clear()
    } catch (err) {
      setMessageSeverity('error')
      setMessage(errorDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">Mass write-off</Typography>
        <Typography variant="body2" color="text.secondary">
          Collect what you need, then weigh and scan each item in turn. Everything is submitted together at the end.
        </Typography>
      </Box>

      {session.items.length > 0 && (
        <Card variant="outlined">
          <List dense={false}>
            {session.items.map((i) => (
              <ListItem
                key={i.key}
                secondaryAction={
                  <IconButton edge="end" aria-label="Remove item" onClick={() => session.removeItem(i.key)}>
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={`${i.name} — ${i.amount ?? 'free'} ${i.unit ?? ''}`}
                  secondary={`${i.displayCode}${i.grantLabel ? ` · ${i.grantLabel}` : ''}`}
                  primaryTypographyProps={{ fontWeight: 600 }}
                />
              </ListItem>
            ))}
          </List>
        </Card>
      )}

      {message && (
        <Alert severity={messageSeverity} onClose={() => setMessage(null)}>{message}</Alert>
      )}

      {current ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">{current.display_code}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
                {current.nomenclature_name}
              </Typography>
              <Typography variant="body1">
                Remaining: <b>{current.current_amount ?? '—'} {current.unit ?? ''}</b>
                {current.grant_code ? ` · Grant: ${current.grant_code}` : ''}
              </Typography>
              <AmountPicker pkg={current} onPick={addItem} freeLabel="Add without amount" />
              <Button
                size="large"
                fullWidth
                onClick={() => { setCurrent(null); setScanKey((k) => k + 1) }}
              >
                Cancel (scan another)
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <>
          <Scanner key={scanKey} hint="Scan the next package" onResult={onScan} />
          <Button
            variant="contained"
            size="large"
            fullWidth
            disabled={busy || session.items.length === 0}
            onClick={finish}
          >
            Finish session ({session.items.length} item{session.items.length === 1 ? '' : 's'})
          </Button>
        </>
      )}

      <Dialog open={!!result} onClose={() => navigate('/')} fullWidth maxWidth="sm">
        {result && (
          <>
            <DialogTitle>Session completed</DialogTitle>
            <DialogContent>
              <Alert severity="success" sx={{ mb: 1.5 }}>
                Written off: {result.success} item{result.success === 1 ? '' : 's'}
              </Alert>
              {result.failed.length > 0 && (
                <Alert severity="warning" sx={{ mb: 1.5 }}>
                  <Typography fontWeight={600} sx={{ mb: 0.5 }}>
                    Not written off: {result.failed.length}
                  </Typography>
                  {result.failed.map((f) => (
                    <div key={f.package_id}>PKG-{String(f.package_id).padStart(5, '0')}: {f.detail}</div>
                  ))}
                </Alert>
              )}
              <Button variant="contained" size="large" fullWidth sx={{ mt: 1 }} onClick={() => navigate('/')}>
                Back to Home
              </Button>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Stack>
  )
}