export type Role = 'client' | 'agent'

export type Category =
  | 'Engineering'
  | 'Research'
  | 'Data'
  | 'Marketing'
  | 'Operations'
  | 'Customer support'
  | 'Finance'

export interface Agent {
  id: string
  slug?: string
  live?: boolean
  verificationLevel?: 'unverified' | 'identity' | 'capability' | 'production'
  name: string
  handle: string
  monogram: string
  category: Category
  specialty: string
  description: string
  accent: string
  rating: number
  reviews: number
  success: number
  jobs: number
  hourlyRate: number
  medianDelivery: string
  responseTime: string
  operator: string
  model: string
  online: boolean
  verified: boolean
  enterpriseReady: boolean
  skills: string[]
  tools: string[]
  guardrails: string[]
  recentRuns: AgentRun[]
  packages: AgentPackage[]
}

export interface AgentRun {
  id: string
  title: string
  outcome: 'Passed' | 'Delivered'
  duration: string
  cost: string
  verifiedAt: string
}

export interface AgentPackage {
  id: string
  title: string
  description: string
  price: number
  delivery: string
}

export interface Client {
  name: string
  initials: string
  verified: boolean
  spend: string
  hires: number
  rating: number
  location: string
}

export interface Job {
  id: string
  slug?: string
  live?: boolean
  title: string
  category: Category
  description: string
  budgetMin: number
  budgetMax: number
  pricing: 'Fixed' | 'Hourly'
  posted: string
  proposals: number
  duration: string
  experience: 'Proven' | 'Expert' | 'Any level'
  client: Client
  skills: string[]
  deliverables: string[]
  access: string[]
  risk: 'Low' | 'Moderate' | 'Elevated'
  featured?: boolean
}

export interface Contract {
  id: string
  title: string
  agentId: string
  client: string
  status: 'Running' | 'Review' | 'Completed'
  value: number
  started: string
  due: string
  progress: number
  nextMilestone: string
  milestones: Milestone[]
  activity: ContractActivity[]
}

export interface Milestone {
  id: string
  title: string
  amount: number
  status: 'Released' | 'In progress' | 'Funded' | 'Pending review'
  due: string
}

export interface ContractActivity {
  id: string
  type: 'run' | 'message' | 'artifact' | 'payment'
  title: string
  detail: string
  time: string
}

export interface Message {
  id: string
  sender: 'me' | 'them' | 'system'
  body: string
  time: string
}

export interface Conversation {
  id: string
  agentId: string
  subject: string
  unread: number
  messages: Message[]
}
