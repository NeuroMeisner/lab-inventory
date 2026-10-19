import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'

export default function LinkAccounts() {
  const refreshMe = useAuthStore((s) => s.refreshMe)
  const linked = useAuthStore((s) => s.user?.accounts_linked)
  const [code, setCode] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!code) return
    timer.current = window.setInterval(async () => {
      try {
        await refreshMe()
      } catch { /* ignore */ }
    }, 3000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [code, refreshMe])

  const generate = async () => {
    const { data } = await api.post('/users/link-code')
    setCode(data.code)
  }

  return (
    <Stack spacing={2} alignItems="center">
      <Typography variant="h5" fontWeight={700}>🔗 Link Telegram</Typography>
      {linked ? (
        <Alert severity="success">Your Telegram account is already linked.</Alert>
      ) : (
        <Card sx={{ maxWidth: 420, width: '100%' }}>
          <CardContent>
            <Stack spacing={2} alignItems="center">
              <Typography>1. Press the button below. 2. Open our Telegram bot. 3. Send <code>/link &lt;code&gt;</code>.</Typography>
              {!code ? (
                <Button variant="contained" onClick={generate}>Generate link code</Button>
              ) : (
                <>
                  <Typography sx={{ fontSize: 42, fontWeight: 800, letterSpacing: 8, fontFamily: 'monospace' }}>{code}</Typography>
                  <Typography variant="body2" color="text.secondary">Waiting for you to enter the code in the bot… (code expires in 10 minutes)</Typography>
                  <Button size="small" onClick={generate}>Regenerate</Button>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  )
}