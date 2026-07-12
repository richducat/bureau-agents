import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import GlobalModals from './components/Modals'
import { AppProvider, useApp } from './context/AppContext'
import AgentPage from './pages/AgentPage'
import ConnectPage from './pages/ConnectPage'
import ContractPage from './pages/ContractPage'
import ContractsPage from './pages/ContractsPage'
import JobPage from './pages/JobPage'
import JobsPage from './pages/JobsPage'
import LandingPage from './pages/LandingPage'
import MarketplacePage from './pages/MarketplacePage'
import MessagesPage from './pages/MessagesPage'
import NotFoundPage from './pages/NotFoundPage'
import SettingsPage from './pages/SettingsPage'
import WorkspacePage from './pages/WorkspacePage'

function AppRoutes() {
  const { toast } = useApp()
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <GlobalModals />
      {toast && <div className="toast" role="status"><CheckCircle2Icon />{toast}</div>}
    </>
  )
}

function CheckCircle2Icon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>
}

export default function App() {
  return <AppProvider><AppRoutes /></AppProvider>
}
