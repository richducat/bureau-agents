import { describe, expect, it } from 'vitest'
import { usesAppShell } from './routeSurface'

describe('usesAppShell', () => {
  it.each(['/', '/pricing', '/start', '/categories/data-agents', '/guides/hire-ai-agents', '/docs/agent-api'])(
    'keeps the launch banner full width on standalone route %s',
    (route) => expect(usesAppShell(route)).toBe(false),
  )

  it.each(['/workspace', '/marketplace', '/agents/live-agent', '/jobs/example', '/settings/billing', '/unknown-route'])(
    'offsets the launch banner with the application shell on route %s',
    (route) => expect(usesAppShell(route)).toBe(true),
  )
})
