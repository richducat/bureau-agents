export type ClientPlan = 'client_starter' | 'client_scale'
export type OperatorPlan = 'operator_starter' | 'operator_pro'

export const PRICING = {
  client_starter: { monthlyCents: 0, feeBasisPoints: 500, label: 'Client Starter' },
  client_scale: { monthlyCents: 14_900, feeBasisPoints: 300, label: 'Client Scale' },
  operator_starter: { monthlyCents: 0, feeBasisPoints: 1_000, label: 'Operator Starter' },
  operator_pro: { monthlyCents: 4_900, feeBasisPoints: 700, label: 'Operator Pro' },
} as const

export interface FeeBreakdown {
  workValueCents: number
  clientFeeBasisPoints: number
  operatorFeeBasisPoints: number
  clientFeeCents: number
  operatorFeeCents: number
  clientTotalCents: number
  operatorNetCents: number
  bureauGrossCents: number
  estimatedStripeProcessingCents: number
  estimatedConnectVariableCents: number
  estimatedBureauNetCents: number
}

function percentage(amountCents: number, basisPoints: number) {
  return Math.round((amountCents * basisPoints) / 10_000)
}

export function calculateFees(
  workValueCents: number,
  clientPlan: ClientPlan = 'client_starter',
  operatorPlan: OperatorPlan = 'operator_starter',
): FeeBreakdown {
  if (!Number.isSafeInteger(workValueCents) || workValueCents < 500) {
    throw new Error('Work value must be an integer of at least 500 cents')
  }
  const clientFeeBasisPoints = PRICING[clientPlan].feeBasisPoints
  const operatorFeeBasisPoints = PRICING[operatorPlan].feeBasisPoints
  const clientFeeCents = percentage(workValueCents, clientFeeBasisPoints)
  const operatorFeeCents = percentage(workValueCents, operatorFeeBasisPoints)
  const clientTotalCents = workValueCents + clientFeeCents
  const operatorNetCents = workValueCents - operatorFeeCents
  const bureauGrossCents = clientFeeCents + operatorFeeCents

  // US online-card and Connect variable estimates. The payment ledger stores Stripe's actual fee after settlement.
  const estimatedStripeProcessingCents = percentage(clientTotalCents, 290) + 30
  const estimatedConnectVariableCents = percentage(operatorNetCents, 25) + 25
  return {
    workValueCents,
    clientFeeBasisPoints,
    operatorFeeBasisPoints,
    clientFeeCents,
    operatorFeeCents,
    clientTotalCents,
    operatorNetCents,
    bureauGrossCents,
    estimatedStripeProcessingCents,
    estimatedConnectVariableCents,
    estimatedBureauNetCents: bureauGrossCents - estimatedStripeProcessingCents - estimatedConnectVariableCents,
  }
}
