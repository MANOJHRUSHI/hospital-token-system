import { Navigate } from 'react-router-dom'
import { useAuth, ROLE_HOME } from '../context/AuthContext'
import { Loading, Card } from './ui'

export default function ProtectedRoute({ role, children }) {
  const { session, profile, loading, signOut } = useAuth()

  if (loading) return <Loading text="Loading your account…" />
  if (!session) return <Navigate to="/login" replace />

  if (!profile) {
    return (
      <div className="mx-auto mt-20 max-w-md px-4">
        <Card>
          <p className="text-sm text-slate-700">
            Your account has no profile yet. Make sure <code>supabase/schema.sql</code> was run, then sign out and
            sign in again.
          </p>
          <button onClick={signOut} className="mt-4 text-sm font-semibold text-teal-700">
            Sign out
          </button>
        </Card>
      </div>
    )
  }

  // wrong dashboard for this role -> send them to their own
  if (profile.role !== role) return <Navigate to={ROLE_HOME[profile.role]} replace />
  return children
}
