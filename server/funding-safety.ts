export function fundingMustFailClosed(contractStatus: unknown, legacyUnverifiedSource: unknown) {
  const status = String(contractStatus ?? '')
  return status === 'cancelled' || (status === 'pending_funding' && Number(legacyUnverifiedSource) > 0)
}
