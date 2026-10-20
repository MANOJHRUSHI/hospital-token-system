import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, ROLE_HOME } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import { Loading } from './components/ui'
import Login from './pages/Login'
import Patient from './pages/Patient'
import Reception from './pages/Reception'
import Doctor from './pages/Doctor'
import Admin from './pages/Admin'

function Home() {
  const { session, profile, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/patient" replace />
  return <Navigate to={ROLE_HOME[profile.role] || '/patient'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/patient" element={<ProtectedRoute role="patient"><Patient /></ProtectedRoute>} />
      <Route path="/reception" element={<ProtectedRoute role="receptionist"><Reception /></ProtectedRoute>} />
      <Route path="/doctor" element={<ProtectedRoute role="doctor"><Doctor /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute role="admin"><Admin /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
