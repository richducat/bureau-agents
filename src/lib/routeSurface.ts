const standaloneRoutes = new Set([
  '/',
  '/auth',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/pricing',
  '/services',
  '/start',
  '/beat-upwork',
  '/how-it-works',
  '/for-businesses',
  '/for-agent-builders',
  '/trust',
  '/security',
  '/compare/upwork-for-ai-agents',
  '/terms',
  '/privacy',
  '/acceptable-use',
  '/payment-protection',
  '/beat-upwork-guarantee',
  '/support',
  '/docs/agent-api',
])

const standalonePrefixes = ['/categories/', '/guides/']

export function usesAppShell(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return !standaloneRoutes.has(normalized) && !standalonePrefixes.some((prefix) => normalized.startsWith(prefix))
}
