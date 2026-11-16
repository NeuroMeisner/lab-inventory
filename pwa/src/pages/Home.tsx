import { Alert, Avatar, Box, Button, Chip, Grid, Paper, Stack, Typography } from '@mui/material'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import PlaylistAddCheckRoundedIcon from '@mui/icons-material/PlaylistAddCheckRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded'
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded'
import CategoryRoundedIcon from '@mui/icons-material/CategoryRounded'
import AddBoxRoundedIcon from '@mui/icons-material/AddBoxRounded'
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useWriteOffSession } from '../store/writeOffSession'

export default function Home() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const sessionCount = useWriteOffSession((s) => s.items.length)
  const firstName = (user?.full_name ?? user?.google_email ?? '').split(' ')[0]

  const tiles = [
    { label: 'Search', icon: <SearchRoundedIcon sx={{ fontSize: 32 }} />, color: '#1565c0', to: '/search' },
    { label: 'Mass write-off', icon: <PlaylistAddCheckRoundedIcon sx={{ fontSize: 32 }} />, color: '#2e7d32', to: '/write-off-batch', badge: sessionCount },
    { label: 'Place / Move', icon: <PlaceRoundedIcon sx={{ fontSize: 32 }} />, color: '#ef6c00', to: '/scan' },
    { label: 'Open package', icon: <Inventory2RoundedIcon sx={{ fontSize: 32 }} />, color: '#6a1b9a', to: '/open' },
    { label: 'Orders', icon: <ShoppingCartRoundedIcon sx={{ fontSize: 32 }} />, color: '#00838f', to: '/orders' },
    { label: 'My stock', icon: <CategoryRoundedIcon sx={{ fontSize: 32 }} />, color: '#546e7a', to: '/my-packages' },
    { label: 'Register', icon: <AddBoxRoundedIcon sx={{ fontSize: 32 }} />, color: '#c62828', to: '/register', admin: true },
    { label: 'Admin panel', icon: <AdminPanelSettingsRoundedIcon sx={{ fontSize: 32 }} />, color: '#37474f', to: '/admin', admin: true },
  ].filter((t) => !('admin' in t) || !t.admin || user?.role === 'admin')

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5">Hello, {firstName}</Typography>
        <Typography variant="body2" color="text.secondary">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Typography>
      </Box>

      {!user?.accounts_linked && (
        <Alert severity="info" action={<Button color="inherit" size="large" onClick={() => navigate('/link-telegram')}>Link</Button>}>
          Link your Telegram account to get notifications and use the bot.
        </Alert>
      )}

      {sessionCount > 0 && (
        <Paper
          sx={{ p: 2, bgcolor: 'success.light', color: 'success.contrastText', cursor: 'pointer', borderRadius: 3 }}
          onClick={() => navigate('/write-off-batch')}
        >
          <Typography fontWeight={700}>
            Mass session in progress: {sessionCount} item{sessionCount === 1 ? '' : 's'} — tap to continue
          </Typography>
        </Paper>
      )}

      <Grid container spacing={2}>
        {tiles.map((t) => (
          <Grid item xs={6} sm={4} md={3} key={t.to}>
            <Paper
              onClick={() => navigate(t.to)}
              elevation={0}
              sx={{
                position: 'relative',
                minHeight: 132,
                p: 2,
                borderRadius: 4,
                textAlign: 'center',
                cursor: 'pointer',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                '&:hover': { transform: 'translateY(-3px)', boxShadow: 5 },
                '&:active': { transform: 'scale(0.97)' },
              }}
            >
              {'badge' in t && t.badge ? (
                <Chip
                  size="small"
                  color="secondary"
                  label={t.badge}
                  sx={{ position: 'absolute', top: 10, right: 10, fontWeight: 700 }}
                />
              ) : null}
              <Avatar sx={{ bgcolor: t.color, width: 62, height: 62, mx: 'auto', mb: 1.2, boxShadow: 2 }}>
                {t.icon}
              </Avatar>
              <Typography fontWeight={700} fontSize={15}>{t.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Typography variant="body2" color="text.secondary" align="center">
        Tip: tap <b>Scan</b> in the bottom bar to scan a package from anywhere in the app.
      </Typography>
    </Stack>
  )
}