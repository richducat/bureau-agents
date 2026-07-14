export const POLICY_VERSIONS = {
  terms: '2026-07-12',
  privacy: '2026-07-12',
  acceptable_use: '2026-07-12',
  operator_terms: '2026-07-12',
} as const

export type SignupPolicy = 'terms' | 'privacy' | 'acceptable_use'

export function signupPolicyAcceptances(): Array<{ document: SignupPolicy; version: string; path: string }> {
  return [
    { document: 'terms', version: POLICY_VERSIONS.terms, path: '/terms' },
    { document: 'privacy', version: POLICY_VERSIONS.privacy, path: '/privacy' },
    { document: 'acceptable_use', version: POLICY_VERSIONS.acceptable_use, path: '/acceptable-use' },
  ]
}
