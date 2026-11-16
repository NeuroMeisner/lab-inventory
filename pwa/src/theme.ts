import { createTheme } from '@mui/material'

export const theme = createTheme({
  palette: {
    primary: { main: '#0d47a1' },
    secondary: { main: '#2e7d32' },
    warning: { main: '#ef6c00' },
    error: { main: '#c62828' },
    background: { default: '#f5f6fa' },
  },
  typography: {
    fontFamily: 'Roboto, Helvetica, Arial, sans-serif',
    body1: { fontSize: 16 },
    body2: { fontSize: 15 },
    h5: { fontSize: 22, fontWeight: 800 },
    h6: { fontSize: 18, fontWeight: 700 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 48, textTransform: 'none', fontWeight: 600 },
        sizeLarge: { minHeight: 56, fontSize: 16, paddingLeft: 20, paddingRight: 20 },
      },
    },
    MuiIconButton: {
      styleOverrides: { root: { minWidth: 48, minHeight: 48 } },
    },
    MuiTextField: {
      defaultProps: { size: 'medium' },
    },
    MuiSelect: {
      defaultProps: { size: 'medium' },
    },
    MuiChip: {
      styleOverrides: {
        root: { height: 40, fontSize: 14, borderRadius: 10 },
        sizeSmall: { height: 32, fontSize: 13 },
      },
    },
    MuiTab: {
      styleOverrides: { root: { minHeight: 48, textTransform: 'none', fontWeight: 600 } },
    },
    MuiBottomNavigationAction: {
      styleOverrides: { root: { minWidth: 56 } },
    },
  },
})