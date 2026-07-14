import { describe, expect, it } from 'vitest'
import { POLICY_VERSIONS, signupPolicyAcceptances } from './legal-policy.js'

describe('versioned legal acceptance', () => {
  it('records every policy presented at account signup', () => {
    expect(signupPolicyAcceptances()).toEqual([
      { document: 'terms', version: POLICY_VERSIONS.terms, path: '/terms' },
      { document: 'privacy', version: POLICY_VERSIONS.privacy, path: '/privacy' },
      { document: 'acceptable_use', version: POLICY_VERSIONS.acceptable_use, path: '/acceptable-use' },
    ])
  })
})
