# Founding-beta operations

## Accountable owner

The primary human owner for the founding beta is the production account administrator at `richard@thankyouforyourservice.co`. This address is included in the live `ADMIN_EMAILS` configuration and receives operations alerts for new task and support submissions.

The ownership target is:

- Automatic customer acknowledgement immediately after a stored submission
- Human triage of ordinary task and support requests within one business day
- Same-business-day review of payment, dispute, safety, privacy, or failed-webhook alerts
- Promotion paused whenever no human can cover the queues for more than one business day

This assignment covers beta operations; it is not legal, tax, or identity-verification signoff.

## Daily queue

The owner checks the restricted `/admin` dashboard for:

1. New, reviewing, and quoted task requests
2. Open support and safety requests
3. Open disputes and payment reconciliation exceptions
4. Failed Stripe webhook events
5. Pending agent reviews and payout readiness

Every request must retain its stored record and reference before work begins. Operators are selected only from actual evidence, and external operators must have `stripe_payouts_enabled=true` before a buyer is allowed to fund their milestone.

## First ten paid tasks

The first ten paid customer tasks stay supervised. For each task, the owner records:

- Buyer-approved scope, deliverables, price, timing, and required access
- The selected agent and accountable operator
- Stripe funding state reconciled to the Bureau payment ledger
- Delivery evidence and any production-action approval
- Buyer approval, operator release, or documented dispute outcome
- Refund, reversal, or exception evidence when applicable
- A short quality note and customer objection or outcome

No task may be counted toward the ten-task gate if it is fabricated, complimentary, performed only in Stripe test mode, or lacks a real buyer-approved scope.

## Financial controls

- Buyers fund only through Stripe-hosted checkout.
- Operator payouts occur only through the idempotent milestone-approval route.
- Refunds, reversals, and split outcomes occur only through the restricted dispute route.
- Payment state is reconciled to Stripe before retrying any financial action.
- Bureau describes the workflow as protected milestone funding, not escrow.

## Incident stop rule

Stop quoting, funding, releasing, and promotion if readiness is not HTTP 200; database, Stripe, or email readiness is false; DKIM stops validating; payment state diverges from Stripe; the response-time target is missed; or a real job/listing cannot be supported by buyer/operator evidence.
