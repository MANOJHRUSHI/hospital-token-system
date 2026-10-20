import { useAuth } from '../context/AuthContext'
import { RoleBadge } from './ui'
import Footer from './Footer'

const ROLE_LABEL = {
  patient: 'Patient',
  receptionist: 'Reception',
  doctor: 'Doctor',
  admin: 'Administrator',
}

export default function Layout({ title, live, children }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] text-slate-800">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white shadow-xs">
              +
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-900">Hospital Token System</div>
              <div className="text-xs text-slate-500">{title}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex" title="Realtime connection">
              <span className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-300'}`} />
              {live ? 'Live sync' : 'Connecting…'}
            </span>
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-800 leading-tight">
                {profile?.full_name || 'User'}
              </div>
              <div className="mt-0.5 flex justify-end">
                <RoleBadge role={profile?.role || 'patient'} />
              </div>
            </div>
            <button
              onClick={signOut}
              className="rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">{children}</main>
      <Footer />
    </div>
  )
}
