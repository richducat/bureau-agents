import type { Category } from './types'
import { MANAGED_CATALOG } from '../server/managed-catalog.js'

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
  unitLabelSingular: string
  unitLabel: string
  unitCapacity: number
  maximumAutomaticUnits: number
  includedScope: string[]
  excludedScope: string[]
}

function publishedPackage(id: keyof typeof MANAGED_CATALOG) {
  const service = MANAGED_CATALOG[id]
  return {
    category: service.category as Category,
    startingPrice: service.startingPriceCents / 100,
    turnaround: service.turnaround,
    deliverables: [...service.deliverables],
    unitLabelSingular: service.unitLabelSingular,
    unitLabel: service.unitLabel,
    unitCapacity: service.unitCapacity,
    maximumAutomaticUnits: service.maximumAutomaticUnits,
    includedScope: [...service.includedScope],
    excludedScope: [...service.excludedScope],
  }
}

export const managedServices: ManagedService[] = [
  {
    id: 'market-research',
    ...publishedPackage('market-research'),
    eyebrow: 'Research',
    title: 'Research a market or competitor',
    description: 'Get a decision-ready brief built from current, cited sources—not a pile of links.',
    goodFor: 'Market entry, competitor reviews, vendor selection, and due diligence',
  },
  {
    id: 'spreadsheet-cleanup',
    ...publishedPackage('spreadsheet-cleanup'),
    eyebrow: 'Data',
    title: 'Clean or enrich a spreadsheet',
    description: 'Turn inconsistent, incomplete rows into a usable file with changes you can trace.',
    goodFor: 'CRM cleanup, lead enrichment, deduplication, and list preparation',
  },
  {
    id: 'website-fix',
    ...publishedPackage('website-fix'),
    eyebrow: 'Websites',
    title: 'Fix a website problem',
    description: 'Get a diagnosed, tested fix with a plain-language record of what changed.',
    goodFor: 'Broken forms, layout bugs, accessibility issues, and small product fixes',
  },
  {
    id: 'support-backlog',
    ...publishedPackage('support-backlog'),
    eyebrow: 'Support',
    title: 'Clear a support backlog',
    description: 'Sort routine requests, prepare or send approved replies, and surface the cases needing a person.',
    goodFor: 'Ticket spikes, inbox cleanup, support triage, and knowledge-base gaps',
  },
  {
    id: 'content-brief',
    ...publishedPackage('content-brief'),
    eyebrow: 'Marketing',
    title: 'Create an SEO content brief',
    description: 'Get a focused plan with search intent, sources, structure, and a publish-ready draft option.',
    goodFor: 'New articles, content refreshes, comparison pages, and local search pages',
  },
  {
    id: 'invoice-review',
    ...publishedPackage('invoice-review'),
    eyebrow: 'Finance operations',
    title: 'Review invoices for mistakes',
    description: 'Flag probable duplicates, pricing exceptions, and missing details without moving money.',
    goodFor: 'AP reviews, duplicate detection, policy checks, and close preparation',
  },
]

export function serviceById(id: string | null) {
  return managedServices.find((service) => service.id === id)
}
