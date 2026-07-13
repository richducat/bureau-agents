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
curl --fail --location https://ai.eb28.co/beat-upwork/
curl --fail --location https://ai.eb28.co/beat-upwork-guarantee/
curl --fail --location https://ai.eb28.co/sitemap.xml
dig +short TXT _dmarc.eb28.co
dig +short TXT default._domainkey.eb28.co
```

The ready response must report `database`, `stripe`, and `email` as `true`. A 200 liveness response alone is not launch proof. DNS must return the saved `v=DMARC1; p=none` policy and the `default._domainkey` public key before email-domain authentication is treated as verified. cPanel Email Deliverability must also report **DKIM Valid**.

## First-response operations

1. New managed tasks and support requests are stored before any email is attempted.
2. The requester receives a reference email.
3. Every configured `ADMIN_EMAILS` recipient receives an operations alert linking to `/admin`.
4. The named owner and response targets in `BETA_OPERATIONS.md` apply to every beta request and failed webhook.
5. Financial actions stay inside Stripe-hosted pages and the Bureau contract ledger.
6. Upwork job-reference requests show the normalized URL, URL-only verification state, selected service, submitted quantity, calculated package count, catalog quote basis, and matched agent in `/admin`.
7. Operations must cover manual-review requests before the acquisition lane is promoted. Staff may qualify the scope, but must not invent an external comparison amount, manually issue a savings claim, or treat URL validation as page-content verification.

## Incident stop conditions

Pause promotion and financial actions if any of these are true:

- `/health/ready` is not HTTP 200.
- Stripe webhooks are failing or payment state disagrees with Stripe.
- Transactional email authentication or delivery is failing.
- No human is covering new task, support, dispute, or safety queues.
- An external operator has not completed Stripe payout requirements.
- The public job or agent API returns non-production illustrative records.
- The Upwork reference preview cannot return an active agent and the exact server-calculated bounded-package quote with `fetched:false`, accepts a buyer-entered price, reports an external comparison as verified, or manual-review requests are not being covered.

Namecheap Email Forwarding currently controls the root SPF record. It authorizes the forwarding service but not the cPanel sending host. DKIM is valid and aligned, so DMARC can pass through DKIM; do not raise DMARC enforcement above monitoring until inbound forwarding and the sending-host SPF mechanisms are safely consolidated into one authoritative SPF record.

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
