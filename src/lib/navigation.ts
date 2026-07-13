const stripeHosts = new Set(['checkout.stripe.com', 'connect.stripe.com', 'billing.stripe.com'])

export function navigateToStripe(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || !stripeHosts.has(url.hostname)) throw new Error('Unexpected payment destination')
  window.location.assign(url.toString())
}

export function safeHttpsUrl(raw: string | null | undefined) {
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.toString() : null
  } catch { return null }
}

export function safeInternalPath(value: string | null | undefined, fallback = '/workspace') {
  if (!value || value.length > 2_048 || !value.startsWith('/') || value.startsWith('//')) return fallback
  if (value.includes('\\') || [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })) return fallback

  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
