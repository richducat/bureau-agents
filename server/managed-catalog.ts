export interface ManagedCatalogDefinition {
  id: string
  category: 'Research' | 'Data' | 'Engineering' | 'Customer support' | 'Marketing' | 'Finance'
  startingPriceCents: number
  turnaround: string
  deliverables: readonly string[]
  unitLabelSingular: string
  unitLabel: string
  unitCapacity: number
  maximumAutomaticUnits: number
  includedScope: readonly string[]
  excludedScope: readonly string[]
}

export const MANAGED_CATALOG = {
  'market-research': {
    id: 'market-research', category: 'Research', startingPriceCents: 8_900, turnaround: '1 business day',
    deliverables: ['One-page decision brief', 'Source-linked findings', 'Strengths and gaps table'], unitLabelSingular: 'competitor or market entity', unitLabel: 'competitors or market entities', unitCapacity: 1, maximumAutomaticUnits: 5,
    includedScope: ['One decision question', 'Up to 5 public sources per package', 'English-language desk research'],
    excludedScope: ['Primary interviews', 'Paid datasets', 'Legal or financial advice'],
  },
  'spreadsheet-cleanup': {
    id: 'spreadsheet-cleanup', category: 'Data', startingPriceCents: 4_900, turnaround: '1 business day',
    deliverables: ['Clean export', 'Exceptions sheet', 'Quality summary'], unitLabelSingular: 'spreadsheet row', unitLabel: 'spreadsheet rows', unitCapacity: 1_000, maximumAutomaticUnits: 10_000,
    includedScope: ['One CSV or XLSX workbook', 'Up to 15 columns', 'Deterministic cleanup and deduplication'],
    excludedScope: ['Macros or custom integrations', 'Regulated data', 'Manual data entry from images'],
  },
  'website-fix': {
    id: 'website-fix', category: 'Engineering', startingPriceCents: 9_900, turnaround: '1–2 business days',
    deliverables: ['Root-cause summary', 'Tested change', 'Deployment notes'], unitLabelSingular: 'reproducible website issue', unitLabel: 'reproducible website issues', unitCapacity: 1, maximumAutomaticUnits: 3,
    includedScope: ['One existing site or codebase per package', 'One scoped bug or accessibility fix per package', 'Tests and deployment notes'],
    excludedScope: ['Redesigns or new applications', 'Platform migrations', 'Paid third-party licenses'],
  },
  'support-backlog': {
    id: 'support-backlog', category: 'Customer support', startingPriceCents: 7_900, turnaround: '1 business day',
    deliverables: ['Triage queue', 'Resolved or drafted replies', 'Escalation report'], unitLabelSingular: 'support ticket', unitLabel: 'support tickets', unitCapacity: 20, maximumAutomaticUnits: 100,
    includedScope: ['One support queue', 'Routine triage and draft replies', 'Escalation report'],
    excludedScope: ['Refund authority', 'Security, legal, or medical decisions', 'Live phone support'],
  },
  'content-brief': {
    id: 'content-brief', category: 'Marketing', startingPriceCents: 5_900, turnaround: '1 business day',
    deliverables: ['Search brief', 'Source record', 'Outline and metadata'], unitLabelSingular: 'content brief', unitLabel: 'content briefs', unitCapacity: 1, maximumAutomaticUnits: 5,
    includedScope: ['One topic and site per brief', 'Search intent, outline, and metadata', 'Public-source research'],
    excludedScope: ['Full article drafting', 'Publishing or link building', 'Paid media execution'],
  },
  'invoice-review': {
    id: 'invoice-review', category: 'Finance', startingPriceCents: 6_900, turnaround: '1 business day',
    deliverables: ['Exception queue', 'Evidence workbook', 'Findings summary'], unitLabelSingular: 'invoice', unitLabel: 'invoices', unitCapacity: 25, maximumAutomaticUnits: 250,
    includedScope: ['One structured export', 'Duplicate and exception review', 'Evidence workbook'],
    excludedScope: ['Payment execution', 'Ledger changes', 'Tax or legal advice'],
  },
} as const satisfies Record<string, ManagedCatalogDefinition>
