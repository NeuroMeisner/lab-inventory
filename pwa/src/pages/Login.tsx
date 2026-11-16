import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { errorDetail } from '../api/client'
import { useAuthStore } from '../store/auth'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
const devMode = import.meta.env.DEV
declare global {
  interface Window { google?: any }
}

export default function Login() {
  const navigate = useNavigate()
  const loginGoogle = useAuthStore((s) => s.loginGoogle)
  const [error, setError] = useState<string | null>(null)
  const [devEmail, setDevEmail] = useState('')
  const btnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!googleClientId) return
    let tries = 0
    const timer = setInterval(() => {
      if (window.google?.accounts?.id && btnRef.current) {
        clearInterval(timer)
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: { credential: string }) => {
            try {
              await loginGoogle(response.credential)
              navigate('/')
            } catch (err) {
              setError(errorDetail(err))
            }
          },
        })
        window.google.accounts.id.renderButton(btnRef.current, { theme: 'filled_blue', size: 'large', width: 280 })
      } else if (++tries > 50) clearInterval(timer)
    }, 200)
    return () => clearInterval(timer)
  }, [loginGoogle, navigate])

  const devLogin = async () => {
    try {
      await loginGoogle(`dev:${devEmail}`)
      navigate('/')
    } catch (err) {
      setError(errorDetail(err))
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>Lab Inventory</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Sign in with your lab Google account.
          </Typography>

          {googleClientId ? (
            <div ref={btnRef} />
          ) : devMode ? (
            <Stack spacing={2}>
              <Alert severity="info">
                Google sign-in is not configured. Development sign-in is available.
              </Alert>
              <TextField
                label="Email"
                type="email"
                inputProps={{ inputMode: 'email', autoComplete: 'email' }}
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                placeholder="admin@lab.test"
              />
              <Button
                variant="contained"
                size="large"
                fullWidth
                disabled={!devEmail.includes('@')}
                onClick={devLogin}
              >
                Dev sign-in
              </Button>
            </Stack>
          ) : (
            <Alert severity="error">
              Sign-in is not configured. Contact your administrator.
            </Alert>
          )}

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </CardContent>
      </Card>
    </Box>
  )
}