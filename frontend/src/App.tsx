import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Landing from './pages/Landing'
import CookieBanner from './components/CookieBanner'

const Auth = lazy(() => import('./pages/Auth'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Contact = lazy(() => import('./pages/Contact'))
const NotFound = lazy(() => import('./pages/NotFound'))
const AppShell = lazy(() => import('./app/AppShell'))
const Home = lazy(() => import('./app/Home'))
const Simulator = lazy(() => import('./app/Simulator'))
const Inbox = lazy(() => import('./app/Inbox'))
const Fingerprint = lazy(() => import('./app/Fingerprint'))
const Replay = lazy(() => import('./app/Replay'))
const Brain = lazy(() => import('./app/Brain'))
const Accuracy = lazy(() => import('./app/Accuracy'))
const Coach = lazy(() => import('./app/Coach'))
const Settings = lazy(() => import('./app/Settings'))
const Lab = lazy(() => import('./app/Lab'))
const Models = lazy(() => import('./app/Models'))

function Loader() {
  return <div className="min-h-screen grid place-items-center text-muted" role="status">Loading…</div>
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Loader />
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname)}`} replace />
  if (!user.persona && loc.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<Auth mode="signin" />} />
        <Route path="/signup" element={<Auth mode="signup" />} />
        {/* 301-style client redirects for legacy/alias paths (server-side 301s live in public/_redirects) */}
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route path="/register" element={<Navigate to="/signup" replace />} />
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/onboarding" element={<Protected><Onboarding /></Protected>} />
        <Route path="/app" element={<Protected><AppShell /></Protected>}>
          <Route index element={<Home />} />
          <Route path="multiverse" element={<Simulator />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="fingerprint" element={<Fingerprint />} />
          <Route path="replay" element={<Replay />} />
          <Route path="brain" element={<Brain />} />
          <Route path="accuracy" element={<Accuracy />} />
          <Route path="coach" element={<Coach />} />
          <Route path="lab" element={<Lab />} />
          <Route path="models" element={<Models />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <CookieBanner />
    </Suspense>
  )
}
