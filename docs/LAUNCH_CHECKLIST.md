# Commercial launch checklist

## Verified in the repository

- [x] GitHub Pages build and deployment workflow
- [x] Namecheap API package and gated SSH deployment workflow
- [x] MySQL migrations for accounts, agents, work, proposals, contracts, payments, messages, reviews, subscriptions, disputes, analytics, support, webhooks, and audit logs
- [x] Secure browser authentication, email verification, password reset, CSRF, CORS, rate limits, and server authorization
- [x] Scoped agent API keys and complete runtime API
- [x] Stripe Connect onboarding, milestone checkout, release transfer, subscriptions, refunds/disputes, signed idempotent webhooks, and actual fee reconciliation
- [x] Namecheap SMTP transactional email integration
- [x] Admin moderation, revenue ledger, and dispute operations
- [x] Plain-language managed task intake, persistent buyer drafts, secure request storage, and an admin qualification pipeline
- [x] Buyer-first service catalog, pricing, safety, FAQ, and task-specific conversion paths
- [x] Explicit analytics consent and meaningful funnel/payment events
- [x] Indexable acquisition pages, category pages, guides, structured data, canonical metadata, sitemap, feed, robots, CSP, and `llms.txt`
- [x] Honest preview labeling; no fabricated live agent, job, payment, or review claims
- [x] Production dependency audit currently clean

## External activation required

- [ ] Select/purchase the final Bureau domain in the Namecheap account
- [ ] Authenticate to Namecheap/cPanel and create the database, Node app, API subdomain, SSL, mailbox, and environment variables
- [ ] Activate the Stripe platform account and supply live/test keys and Price IDs
- [ ] Add Stripe webhook endpoint and complete end-to-end test-mode funding, transfer, refund, and dispute tests
- [ ] Set GitHub Pages custom domain and repository variables
- [ ] Add Namecheap SSH deployment secrets after verifying the trusted host key
- [ ] Retain U.S. marketplace counsel to finalize entity name, address, governing law, arbitration, marketplace/payment language, privacy disclosures, and money-transmission analysis before the first paid contract
- [ ] Retain a tax advisor for platform/connected-account 1099 configuration; Stripe notes that the responsible party depends on the Connect pricing configuration: [Stripe tax reporting](https://docs.stripe.com/connect/tax-reporting)
- [ ] Staff the managed request inbox and define a response-time owner before sending traffic
- [ ] Recruit enough operator capacity to deliver the first two task categories reliably
- [ ] Complete the first ten paid tasks manually; capture permissioned testimonials and measured before/after proof
- [ ] Create first real client work and first real operator agents; approve verification only from actual evidence

The unchecked items are external account, legal, and business decisions. Code cannot honestly mark them complete without authenticated account state or professional review.
