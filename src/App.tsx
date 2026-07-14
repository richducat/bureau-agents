import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, useLayoutEffect } from 'react'
import AnalyticsConsent, { PageAnalytics } from './components/AnalyticsConsent'
import { Logo } from './components/Common'
import { AppProvider, useApp } from './context/AppContext'
import RouteSeo from './components/RouteSeo'
import CommercialStatusBanner from './components/CommercialStatusBanner'

const AppShell = lazy(() => import('./components/AppShell'))
const GlobalModals = lazy(() => import('./components/Modals'))
const AgentPage = lazy(() => import('./pages/AgentPage'))
const ConnectPage = lazy(() => import('./pages/ConnectPage'))
const ContractPage = lazy(() => import('./pages/ContractPage'))
const ContractsPage = lazy(() => import('./pages/ContractsPage'))
const JobPage = lazy(() => import('./pages/JobPage'))
const JobsPage = lazy(() => import('./pages/JobsPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'))
const MessagesPage = lazy(() => import('./pages/MessagesPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'))
const AuthPage = lazy(() => import('./pages/AuthPage'))
const VerifyEmailPage = lazy(() => import('./pages/IdentityPages').then((module) => ({ default: module.VerifyEmailPage })))
const ForgotPasswordPage = lazy(() => import('./pages/IdentityPages').then((module) => ({ default: module.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('./pages/IdentityPages').then((module) => ({ default: module.ResetPasswordPage })))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const ServicesPage = lazy(() => import('./pages/ServicesPage'))
const TaskIntakePage = lazy(() => import('./pages/TaskIntakePage'))
const MarketingPage = lazy(() => import('./pages/MarketingPage'))
const LegalPage = lazy(() => import('./pages/LegalPage'))
const SupportPage = lazy(() => import('./pages/SupportPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const PaymentSettingsPage = lazy(() => import('./pages/PaymentSettingsPage'))
const CategoryPage = lazy(() => import('./pages/CategoryPage'))
const GuidePage = lazy(() => import('./pages/GuidePage'))
const DocsPage = lazy(() => import('./pages/DocsPage'))
const UpworkQuotePage = lazy(() => import('./pages/UpworkQuotePage'))

function AppRoutes() {
  const { toast } = useApp()
  return (
    <>
      <ScrollToTopOnRouteChange />
      <a className="skip-link" href="#main-content" onClick={() => {
        const main = document.querySelector('main')
        if (!(main instanceof HTMLElement)) return
        main.id = 'main-content'
        main.tabIndex = -1
        window.requestAnimationFrame(() => main.focus())
      }}>Skip to main content</a>
      <PageAnalytics />
      <RouteSeo />
      <CommercialStatusBanner />
      <Suspense fallback={<RouteLoading />}><Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/start" element={<TaskIntakePage />} />
        <Route path="/beat-upwork" element={<UpworkQuotePage />} />
        <Route path="/how-it-works" element={<MarketingPage />} />
        <Route path="/for-businesses" element={<MarketingPage />} />
        <Route path="/for-agent-builders" element={<MarketingPage />} />
        <Route path="/trust" element={<MarketingPage />} />
        <Route path="/security" element={<MarketingPage />} />
        <Route path="/compare/upwork-for-ai-agents" element={<MarketingPage />} />
        <Route path="/terms" element={<LegalPage />} />
        <Route path="/privacy" element={<LegalPage />} />
        <Route path="/acceptable-use" element={<LegalPage />} />
        <Route path="/payment-protection" element={<LegalPage />} />
        <Route path="/beat-upwork-guarantee" element={<LegalPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/categories/:slug" element={<CategoryPage />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
        <Route path="/docs/agent-api" element={<DocsPage />} />
        <Route element={<AppShell />}>
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/agents/:id" element={<AgentPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobPage />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="/contracts/:id" element={<ContractPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/billing" element={<PaymentSettingsPage />} />
          <Route path="/settings/payments" element={<Navigate to="/settings/billing" replace />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes></Suspense>
      <Suspense fallback={null}><GlobalModals /></Suspense>
      {toast && <div className="toast" role="status"><CheckCircle2Icon />{toast}</div>}
      <AnalyticsConsent />
    </>
  )
}

function ScrollToTopOnRouteChange() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])
  return null
}

function RouteLoading() {
  return <div className="route-loading" role="status" aria-live="polite">
    <header><Logo /></header>
    <main>
      <span className="route-loading__pulse" aria-hidden="true" />
      <strong>Opening your Bureau desk</strong>
      <small>Loading current work, agents, and account controls…</small>
      <div className="route-loading__skeleton" aria-hidden="true"><i /><i /><i /></div>
    </main>
  </div>
}

function CheckCircle2Icon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>
}

export default function App() {
  return <AppProvider><AppRoutes /></AppProvider>
}
