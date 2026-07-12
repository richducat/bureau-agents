import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { agents, initialContracts, initialConversations, initialJobs } from '../data'
import { usePersistentState } from '../lib/usePersistentState'
import type { Agent, Contract, Conversation, Job, Role } from '../types'

export type ModalState =
  | { type: 'post-job' }
  | { type: 'hire-agent'; agent: Agent }
  | { type: 'submit-proposal'; job: Job }
  | null

interface AppContextValue {
  role: Role
  setRole: (role: Role) => void
  jobs: Job[]
  addJob: (job: Job) => void
  incrementProposals: (jobId: string) => void
  contracts: Contract[]
  addContract: (contract: Contract) => void
  approveMilestone: (contractId: string, milestoneId: string) => void
  conversations: Conversation[]
  sendMessage: (conversationId: string, body: string) => void
  savedAgents: string[]
  toggleSavedAgent: (agentId: string) => void
  modal: ModalState
  setModal: (modal: ModalState) => void
  toast: string | null
  showToast: (message: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = usePersistentState<Role>('bureau-role', 'client')
  const [jobs, setJobs] = usePersistentState<Job[]>('bureau-jobs', initialJobs)
  const [contracts, setContracts] = usePersistentState<Contract[]>('bureau-contracts', initialContracts)
  const [conversations, setConversations] = usePersistentState<Conversation[]>('bureau-conversations', initialConversations)
  const [savedAgents, setSavedAgents] = usePersistentState<string[]>('bureau-saved-agents', ['scout-os'])
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    document.body.style.overflow = modal ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [modal])

  const showToast = (message: string) => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }

  const addJob = (job: Job) => setJobs((current) => [job, ...current])

  const incrementProposals = (jobId: string) => {
    setJobs((current) => current.map((job) => (job.id === jobId ? { ...job, proposals: job.proposals + 1 } : job)))
  }

  const addContract = (contract: Contract) => setContracts((current) => [contract, ...current])

  const approveMilestone = (contractId: string, milestoneId: string) => {
    setContracts((current) =>
      current.map((contract) => {
        if (contract.id !== contractId) return contract
        const milestones = contract.milestones.map((milestone) =>
          milestone.id === milestoneId ? { ...milestone, status: 'Released' as const } : milestone,
        )
        const released = milestones.filter((milestone) => milestone.status === 'Released').length
        const progress = Math.round((released / milestones.length) * 100)
        return {
          ...contract,
          milestones,
          progress,
          status: progress === 100 ? ('Completed' as const) : contract.status,
          activity: [
            {
              id: `activity-${Date.now()}`,
              type: 'payment' as const,
              title: 'Milestone approved and released',
              detail: 'Payment released from Bureau Vault after client approval',
              time: 'Just now',
            },
            ...contract.activity,
          ],
        }
      }),
    )
  }

  const sendMessage = (conversationId: string, body: string) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              messages: [
                ...conversation.messages,
                { id: `message-${Date.now()}`, sender: 'me' as const, body, time: 'Just now' },
              ],
            }
          : conversation,
      ),
    )
  }

  const toggleSavedAgent = (agentId: string) => {
    setSavedAgents((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    )
    const agent = agents.find((item) => item.id === agentId)
    showToast(currentSavedMessage(savedAgents.includes(agentId), agent?.name ?? 'Agent'))
  }

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        jobs,
        addJob,
        incrementProposals,
        contracts,
        addContract,
        approveMilestone,
        conversations,
        sendMessage,
        savedAgents,
        toggleSavedAgent,
        modal,
        setModal,
        toast,
        showToast,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

function currentSavedMessage(isSaved: boolean, name: string) {
  return isSaved ? `${name} removed from your bench` : `${name} saved to your bench`
}

export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}
