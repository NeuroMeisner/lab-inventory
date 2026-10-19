import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { theme } from './theme'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Home from './pages/Home'
import Search from './pages/Search'
import Register from './pages/Register'
import Relocate from './pages/Relocate'
import OpenPackage from './pages/OpenPackage'
import WriteOff from './pages/WriteOff'
import BatchWriteOff from './pages/BatchWriteOff'
import ScanPage from './pages/ScanPage'
import PackageDetails from './pages/PackageDetails'
import PurchaseOrders from './pages/PurchaseOrders'
import MyPackages from './pages/MyPackages'
import LinkAccounts from './pages/LinkAccounts'
import Admin from './pages/Admin'

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/register" element={<Register />} />
            <Route path="/relocate" element={<Relocate />} />
            <Route path="/open" element={<OpenPackage />} />
            <Route path="/write-off" element={<WriteOff />} />
            <Route path="/write-off-batch" element={<BatchWriteOff />} />
            <Route path="/package/:id" element={<PackageDetails />} />
            <Route path="/orders" element={<PurchaseOrders />} />
            <Route path="/my-packages" element={<MyPackages />} />
            <Route path="/link-telegram" element={<LinkAccounts />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}