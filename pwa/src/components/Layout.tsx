import { useEffect, useState } from 'react'
import {
  AppBar, Avatar, BottomNavigation, BottomNavigationAction, Box, Chip, Container, Divider,
  Fab, IconButton, ListItemIcon, Menu, MenuItem, Paper, Toolbar, Typography,
} from '@mui/material'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import HomeIcon from '@mui/icons-material/Home'
import SearchIcon from '@mui/icons-material/Search'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import CategoryIcon from '@mui/icons-material/Category'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import LogoutIcon from '@mui/icons-material/Logout'
import LinkIcon from '@mui/icons-material/Link'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useOutboxStore } from '../store/outbox'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const outboxCount = useOutboxStore((s) => s.items.length)
  const [online, setOnline] = useState(navigator.onLine)
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const initials = (user?.full_name ?? user?.google_email ?? '?')
    .split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <Box sx={{ pb: 10, minHeight: '100vh', bgcolor: '#f5f6fa' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Typography fontWeight={800} sx={{ flexGrow: 1, cursor: 'pointer' }} onClick={() => navigate('/')}>
            🧪 Lab Inventory
          </Typography>
          {!online && <Chip size="small" color="warning" icon={<CloudOffIcon />} label="Offline" />}
          {outboxCount > 0 && (
            <Chip size="small" color="secondary" icon={<UploadFileIcon />} label={outboxCount} />
          )}
          <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} size="small">
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main', fontSize: 14 }}>{initials}</Avatar>
          </IconButton>
          <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
            <MenuItem disabled sx={{ opacity: '1 !important' }}>
              <Box>
                <Typography variant="body2" fontWeight={700}>{user?.full_name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.google_email} {user?.role === 'admin' ? '· admin' : ''}
                </Typography>
              </Box>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setMenuAnchor(null); navigate('/link-telegram') }}>
              <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon> Link Telegram
            </MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); logout(); navigate('/login') }}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon> Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ pt: 2 }}>
        <Outlet />
      </Container>

      {/* Круглая кнопка сканера */}
      <Fab
        color="secondary"
        sx={{ position: 'fixed', bottom: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 1200, boxShadow: 4 }}
        onClick={() => navigate('/scan')}
        aria-label="Scan"
      >
        <QrCodeScannerIcon />
      </Fab>

      {/* Нижняя навигация */}
      <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100 }} elevation={10}>
        <BottomNavigation
          value={location.pathname}
          onChange={(_, v) => { if (v !== '__spacer') navigate(v) }}
          showLabels
        >
          <BottomNavigationAction label="Home" icon={<HomeIcon />} value="/" />
          <BottomNavigationAction label="Search" icon={<SearchIcon />} value="/search" />
          <BottomNavigationAction value="__spacer" sx={{ minWidth: 72 }} icon={<Box sx={{ height: 40 }} />} />
          <BottomNavigationAction label="Orders" icon={<ShoppingCartIcon />} value="/orders" />
          <BottomNavigationAction label="My stock" icon={<CategoryIcon />} value="/my-packages" />
        </BottomNavigation>
      </Paper>
    </Box>
  )
}