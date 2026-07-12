import type { Category } from './types'

export interface ManagedService {
  id: string
  category: Category
  eyebrow: string
  title: string
  description: string
  startingPrice: number
  turnaround: string
  deliverables: string[]
  goodFor: string
}

export const managedServices: ManagedService[] = [
  {
    id: 'market-research',
    category: 'Research',
    eyebrow: 'Research',
    title: 'Research a market or competitor',
    description: 'Get a decision-ready brief built from current, cited sources—not a pile of links.',
    startingPrice: 390,
    turnaround: '24–48 hours',
    deliverables: ['Executive brief', 'Source-linked findings', 'Structured comparison'],
    goodFor: 'Market entry, competitor reviews, vendor selection, and due diligence',
  },
  {
    id: 'spreadsheet-cleanup',
    category: 'Data',
    eyebrow: 'Data',
    title: 'Clean or enrich a spreadsheet',
    description: 'Turn inconsistent, incomplete rows into a usable file with changes you can trace.',
    startingPrice: 210,
    turnaround: '1–2 days',
    deliverables: ['Clean export', 'Exceptions sheet', 'Quality summary'],
    goodFor: 'CRM cleanup, lead enrichment, deduplication, and list preparation',
  },
  {
    id: 'website-fix',
    category: 'Engineering',
    eyebrow: 'Websites',
    title: 'Fix a website problem',
    description: 'Get a diagnosed, tested fix with a plain-language record of what changed.',
    startingPrice: 280,
    turnaround: '1–3 days',
    deliverables: ['Root-cause summary', 'Tested change', 'Deployment notes'],
    goodFor: 'Broken forms, layout bugs, accessibility issues, and small product fixes',
  },
  {
    id: 'support-backlog',
    category: 'Customer support',
    eyebrow: 'Support',
    title: 'Clear a support backlog',
    description: 'Sort routine requests, prepare or send approved replies, and surface the cases needing a person.',
    startingPrice: 290,
    turnaround: '1–2 days',
    deliverables: ['Triage queue', 'Resolved or drafted replies', 'Escalation report'],
    goodFor: 'Ticket spikes, inbox cleanup, support triage, and knowledge-base gaps',
  },
  {
    id: 'content-brief',
    category: 'Marketing',
    eyebrow: 'Marketing',
    title: 'Create an SEO content brief',
    description: 'Get a focused plan with search intent, sources, structure, and a publish-ready draft option.',
    startingPrice: 240,
    turnaround: '2 days',
    deliverables: ['Search brief', 'Source record', 'Outline and metadata'],
    goodFor: 'New articles, content refreshes, comparison pages, and local search pages',
  },
  {
    id: 'invoice-review',
    category: 'Finance',
    eyebrow: 'Finance operations',
    title: 'Review invoices for mistakes',
    description: 'Flag probable duplicates, pricing exceptions, and missing details without moving money.',
    startingPrice: 325,
    turnaround: '1–2 days',
    deliverables: ['Exception queue', 'Evidence workbook', 'Findings summary'],
    goodFor: 'AP reviews, duplicate detection, policy checks, and close preparation',
  },
]

export function serviceById(id: string | null) {
  return managedServices.find((service) => service.id === id)
}
