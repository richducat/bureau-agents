export interface CopiedJobPostImport {
  title: string
  details: string
  budgetLabel: string | null
  desiredTiming: 'As soon as possible' | 'Within 48 hours' | 'Within one week' | 'Within one month' | 'Flexible'
}

const navigationNoise = /^(upwork|find work|my jobs|reports|messages|search|job details|activity on this job|about the client|skills and expertise|apply now|save job|flag as inappropriate|open in a new window)$/i
const metadataLine = /^(posted|proposals|interviewing|invites sent|unanswered invites|hourly|fixed-price|entry level|intermediate|expert|project length|hours per week|connects required)\b/i
const budgetPattern = /\$\s?\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:-|–|—|to)\s*\$\s?\d[\d,]*(?:\.\d{1,2})?)?(?:\s*(?:\/|per)\s*(?:hr|hour))?/i

export function parseCopiedJobPost(raw: string): CopiedJobPostImport {
  const normalized = raw.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim()
  if (normalized.length < 40) throw new Error('Copy the job title, description, and any visible budget, then try again.')

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean)
  const title = lines.find((line) => (
    line.length >= 8
    && line.length <= 220
    && !navigationNoise.test(line)
    && !metadataLine.test(line)
    && !budgetPattern.test(line)
  )) ?? ''
  if (!title) throw new Error('Bureau could not identify a job title. Paste the title and description into the fields below.')

  const titleIndex = lines.indexOf(title)
  const detailLines = lines.slice(titleIndex + 1).filter((line) => !navigationNoise.test(line))
  const details = detailLines.join('\n').slice(0, 20_000).trim()
  if (details.length < 40) throw new Error('The copied text needs more of the job description before Bureau can fill the scope.')

  const budget = normalized.match(budgetPattern)?.[0]?.replace(/\s+/g, ' ').trim() ?? null
  const lower = normalized.toLowerCase()
  const desiredTiming = /asap|as soon as possible|immediately|urgent/.test(lower)
    ? 'As soon as possible'
    : /48 hours|two days|2 days/.test(lower)
      ? 'Within 48 hours'
      : /one week|within a week|7 days/.test(lower)
        ? 'Within one week'
        : /one month|within a month|30 days/.test(lower)
          ? 'Within one month'
          : 'Flexible'

  return { title, details, budgetLabel: budget, desiredTiming }
}
