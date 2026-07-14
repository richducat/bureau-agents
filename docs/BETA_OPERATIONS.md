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
6. New Upwork job-reference requests, especially `manual_review` items approaching the one-business-day response target

Every request must retain its stored record and reference before work begins. Operators are selected only from actual evidence, and external operators must have `stripe_payouts_enabled=true` before a buyer is allowed to fund their milestone.

For an Upwork job reference, the owner checks that the requester attested authority and package fit, the normalized URL belongs to an allowed public Upwork job pattern, the submitted quantity uses the selected service's unit, and the matched agent is active. Bureau validates URL format only: it does not fetch or scrape the page, copy freelancer identity or private proposal content, or treat the URL as proof of an external price. The quote must be the server-calculated whole-package total from the published capacity and rate. Quantities above the automatic maximum, scopes outside published boundaries, or requests without an active match stay in manual review with no payable quote or savings claim.

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

- The operator approved the Bureau milestone-payment pilot on Inspector Gadgets LLC on 2026-07-14 with hard ceilings of $500 per customer charge, $1,000 in daily customer charges, $5,000 in lifetime customer charges, and $8,000 in maximum lifetime principal-plus-Stripe fee/refund/dispute/chargeback exposure.
- `LEGAL_REVIEW_COMPLETED`, `TAX_REVIEW_COMPLETED`, `COMMERCIAL_PAYMENTS_ENABLED`, and `MILESTONE_PAYMENT_PILOT_ENABLED` remain `false` until the corresponding dated evidence is retained. The two activation flags are set last.
- Production paid status additionally requires a live Stripe secret key and webhook configuration. Test credentials can never satisfy production commercial readiness.
- The public `/api/public/readiness` endpoint is the customer-facing source of truth. It reports the four pilot caps and product availability.
- New subscriptions and paid agent-verification purchases are not authorized for this pilot. Their endpoints always fail closed, stale Bureau checkout links are expired, and existing Stripe products or existing subscription-management access are not modified.
- Every open milestone Checkout Session reserves its full customer total against the daily and lifetime caps. A serialized database lock prevents concurrent checkouts from overcommitting either cap.
- Refunded and disputed customer principal is never subtracted from lifetime usage. Each open or completed payment also reserves $300 of the exposure ceiling for Stripe processing, Connect, refund, dispute, chargeback, and rare network overhead; observed Bureau-attributable fees replace the reserve if they are higher.
- Checkout accepts USD cards only and expires after 30 minutes. An expired or failed session releases only its open reservation; a completed charge remains in lifetime usage permanently.
- Buyers fund only through Stripe-hosted checkout.
- Operator payouts occur only through the idempotent milestone-approval route.
- Refunds, reversals, and split outcomes occur only through the restricted dispute route.
- Payment state is reconciled to Stripe before retrying any financial action.
- Bureau describes the workflow as protected milestone funding, not escrow.
- Bureau does not automatically counter Stripe disputes. Any response that could create a new countered-dispute or network fee requires its own specific financial authorization.

## Incident stop rule

Stop quoting, funding, releasing, and promotion if readiness is not HTTP 200; database, Stripe, or email readiness is false; DKIM stops validating; payment state diverges from Stripe; the response-time target is missed; or a real job/listing cannot be supported by buyer/operator evidence.
