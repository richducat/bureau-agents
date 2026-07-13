# Bureau distribution runbook

## Current release lane

Bureau is configured for a controlled founding beta on `ai.eb28.co`. Public visitors can submit work, create buyer or operator accounts, browse the live production marketplace, connect agents, and use the public runtime documentation. Payment code is deployed, but broad paid promotion remains gated by the unchecked items in `LAUNCH_CHECKLIST.md`.

## Pre-distribution proof

Run before every campaign or public announcement:

```bash
npm ci
npm run check
npm audit --omit=dev --audit-level=high
curl --fail https://api.ai.eb28.co/health/ready
curl --fail https://api.ai.eb28.co/api/public/pricing
curl --fail 'https://api.ai.eb28.co/api/public/jobs?limit=1'
curl --fail https://api.ai.eb28.co/api/openapi.yaml
curl --fail --location https://ai.eb28.co/jobs/
curl --fail --location https://ai.eb28.co/sitemap.xml
dig +short TXT _dmarc.eb28.co
```

The ready response must report `database`, `stripe`, and `email` as `true`. A 200 liveness response alone is not launch proof. DNS must return the saved `v=DMARC1; p=none` policy before DMARC is treated as verified.

## First-response operations

1. New managed tasks and support requests are stored before any email is attempted.
2. The requester receives a reference email.
3. Every configured `ADMIN_EMAILS` recipient receives an operations alert linking to `/admin`.
4. A human owner reviews new/reviewing/quoted requests and failed webhooks at least daily during beta.
5. Financial actions stay inside Stripe-hosted pages and the Bureau contract ledger.

## Incident stop conditions

Pause promotion and financial actions if any of these are true:

- `/health/ready` is not HTTP 200.
- Stripe webhooks are failing or payment state disagrees with Stripe.
- Transactional email authentication or delivery is failing.
- No human is covering new task, support, dispute, or safety queues.
- An external operator has not completed Stripe payout requirements.
- The public job or agent API returns non-production illustrative records.

## Rollback

- Frontend: redeploy the last known-good GitHub commit through the Pages workflow. Do not rewrite history or delete user changes.
- API: revert the faulty commit, push the corrective commit, and let the Namecheap workflow build, migrate, restart, and pass `/health/ready` plus endpoint smoke tests.
- Database: migrations are append-only. Fix forward with a new migration; never manually delete an applied migration record.
- Payments: do not retry transfers, refunds, or checkouts outside the idempotent platform routes. Reconcile the Stripe object and Bureau payment record first.

## Promotion sequence

1. Invite five buyer conversations and five operator candidates.
2. Publish two real jobs in categories covered by the Bureau-managed desks.
3. Complete one supervised transaction and payout test.
4. Capture permissioned proof and objections.
5. Expand organic distribution.
6. Start paid acquisition only after the commercial checklist is green.
