import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'

export default function LinkAccounts() {
  const refreshMe = useAuthStore((s) => s.refreshMe)
  const linked = useAuthStore((s) => s.user?.accounts_linked)
  const [code, setCode] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(600)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!code) return
    setSecondsLeft(600)
    timer.current = window.setInterval(async () => {
      setSecondsLeft((s) => Math.max(0, s - 1))
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

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <Stack spacing={2} alignItems="center">
      <Typography variant="h5">Link Telegram</Typography>

      {linked ? (
        <Alert severity="success">Your Telegram account is already linked.</Alert>
      ) : (
        <Card sx={{ maxWidth: 440, width: '100%' }}>
          <CardContent>
            <Stack spacing={2} alignItems="center">
              <Typography align="center">
                1. Press the button below.<br />
                2. Open our Telegram bot.<br />
                3. Send <code>/link &lt;code&gt;</code>.
              </Typography>

              {!code ? (
                <Button variant="contained" size="large" fullWidth onClick={generate}>
                  Generate link code
                </Button>
              ) : (
                <>
                  <Typography
                    sx={{
                      fontSize: 42,
                      fontWeight: 800,
                      letterSpacing: 8,
                      fontFamily: 'monospace',
                      userSelect: 'all',
                    }}
                  >
                    {code}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Waiting for you to enter the code in the bot… (expires in {mm}:{ss})
                  </Typography>
                  <Button size="large" onClick={generate}>Regenerate</Button>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  )
}