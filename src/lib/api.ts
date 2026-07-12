export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: Array<{ path: string; message: string }> }
  requestId?: string
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: ApiErrorBody['error']) {
    super(message)
  }
}

const configuredBase = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || '').trim()
export const isApiConfigured = configuredBase.length > 0
export const apiBase = (configuredBase || '/api').replace(/\/$/, '')
let csrfToken: string | null = null

function requireConfiguredApi() {
  if (!isApiConfigured) {
    throw new ApiError(503, 'api_not_configured', 'Secure marketplace transactions are not activated on this site yet.')
  }
}

async function getCsrfToken() {
  requireConfiguredApi()
  if (csrfToken) return csrfToken
  const response = await fetch(`${apiBase}/auth/csrf`, { credentials: 'include', headers: { accept: 'application/json' } })
  if (!response.ok) throw new ApiError(response.status, 'csrf_unavailable', 'Secure connection could not be established.')
  const body = await response.json() as { csrfToken: string }
  csrfToken = body.csrfToken
  return csrfToken
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  requireConfiguredApi()
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  headers.set('accept', 'application/json')
  if (options.body && !(options.body instanceof FormData)) headers.set('content-type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('x-csrf-token', await getCsrfToken())

  const response = await fetch(`${apiBase}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
  })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => ({})) as T & ApiErrorBody
  if (!response.ok) {
    if (body.error?.code === 'csrf_failed') csrfToken = null
    throw new ApiError(response.status, body.error?.code ?? 'request_failed', body.error?.message ?? 'Request failed.', body.error)
  }
  return body
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value)
}

export function newIdempotencyKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}
