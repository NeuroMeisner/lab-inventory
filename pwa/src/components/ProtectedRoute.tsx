import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import Layout from './Layout'

export default function ProtectedRoute() {
  const token = useAuthStore((s) => s.accessToken)
  if (!token) return <Navigate to="/login" replace />
  return <Layout />
}