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
    id: 'market-research', category: 'Research', startingPriceCents: 39_000, turnaround: '24–48 hours',
    deliverables: ['Executive brief', 'Source-linked findings', 'Structured comparison'], unitLabelSingular: 'competitor or market entity', unitLabel: 'competitors or market entities', unitCapacity: 5, maximumAutomaticUnits: 15,
    includedScope: ['One decision question', 'Up to 10 public sources per package', 'English-language desk research'],
    excludedScope: ['Primary interviews', 'Paid datasets', 'Legal or financial advice'],
  },
  'spreadsheet-cleanup': {
    id: 'spreadsheet-cleanup', category: 'Data', startingPriceCents: 21_000, turnaround: '1–2 days',
    deliverables: ['Clean export', 'Exceptions sheet', 'Quality summary'], unitLabelSingular: 'spreadsheet row', unitLabel: 'spreadsheet rows', unitCapacity: 10_000, maximumAutomaticUnits: 30_000,
    includedScope: ['One CSV or XLSX workbook', 'Up to 25 columns', 'Deterministic cleanup and deduplication'],
    excludedScope: ['Macros or custom integrations', 'Regulated data', 'Manual data entry from images'],
  },
  'website-fix': {
    id: 'website-fix', category: 'Engineering', startingPriceCents: 28_000, turnaround: '1–3 days',
    deliverables: ['Root-cause summary', 'Tested change', 'Deployment notes'], unitLabelSingular: 'reproducible website issue', unitLabel: 'reproducible website issues', unitCapacity: 1, maximumAutomaticUnits: 3,
    includedScope: ['One existing site or codebase per package', 'One scoped bug or accessibility fix per package', 'Tests and deployment notes'],
    excludedScope: ['Redesigns or new applications', 'Platform migrations', 'Paid third-party licenses'],
  },
  'support-backlog': {
    id: 'support-backlog', category: 'Customer support', startingPriceCents: 29_000, turnaround: '1–2 days',
    deliverables: ['Triage queue', 'Resolved or drafted replies', 'Escalation report'], unitLabelSingular: 'support ticket', unitLabel: 'support tickets', unitCapacity: 50, maximumAutomaticUnits: 200,
    includedScope: ['One support queue', 'Routine triage and draft replies', 'Escalation report'],
    excludedScope: ['Refund authority', 'Security, legal, or medical decisions', 'Live phone support'],
  },
  'content-brief': {
    id: 'content-brief', category: 'Marketing', startingPriceCents: 24_000, turnaround: '2 days',
    deliverables: ['Search brief', 'Source record', 'Outline and metadata'], unitLabelSingular: 'content brief', unitLabel: 'content briefs', unitCapacity: 1, maximumAutomaticUnits: 5,
    includedScope: ['One topic and site per brief', 'Search intent, outline, and metadata', 'Public-source research'],
    excludedScope: ['Full article drafting', 'Publishing or link building', 'Paid media execution'],
  },
  'invoice-review': {
    id: 'invoice-review', category: 'Finance', startingPriceCents: 32_500, turnaround: '1–2 days',
    deliverables: ['Exception queue', 'Evidence workbook', 'Findings summary'], unitLabelSingular: 'invoice', unitLabel: 'invoices', unitCapacity: 100, maximumAutomaticUnits: 500,
    includedScope: ['One structured export', 'Duplicate and exception review', 'Evidence workbook'],
    excludedScope: ['Payment execution', 'Ledger changes', 'Tax or legal advice'],
  },
} as const satisfies Record<string, ManagedCatalogDefinition>
