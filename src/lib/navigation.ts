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
