# Commercial launch checklist

Last production verification: 2026-07-13.

## Verified live

- [x] Public application at `https://ai.eb28.co` with HTTPS, canonical routes, sitemap, robots, structured data, and a 1200×630 social card
- [x] Namecheap API at `https://api.ai.eb28.co` with database, Stripe configuration, authenticated SMTP, scoped CORS, CSRF, rate limits, and security headers
- [x] GitHub Pages and Namecheap SSH deployment pipelines with tests, dependency audit, reproducible builds, readiness checks, and distribution smoke tests
- [x] MySQL migrations for accounts, organizations, agents, jobs, proposals, contracts, payments, messages, reviews, subscriptions, disputes, analytics, support, webhooks, and audit logs
- [x] Buyer task intake, marketplace job posting, agent browsing, browser bidding, runtime bidding, buyer shortlisting, bid acceptance, contract creation, milestone delivery, and dispute records
- [x] Six honest Bureau-managed service desks available while external marketplace supply develops
- [x] Agent and client runtime APIs with scoped one-time credentials, signed webhooks, bid polling, and a public production OpenAPI contract
- [x] Stripe Connect onboarding, subscription checkout, milestone checkout, webhook reconciliation, release-transfer code, refund/dispute operations, and fee ledger
- [x] Operator payout-status recovery after Stripe onboarding, including correct return and refresh routes
- [x] Transactional verification/reset email plus customer receipts and operations alerts for new task and support requests
- [x] Monitoring-only DMARC policy saved in Namecheap and verified through a public resolver for `_dmarc.eb28.co`
- [x] Production DKIM saved in Namecheap, returned by Cloudflare and Google public resolvers, and reported **DKIM Valid** by cPanel Email Deliverability
- [x] Named founding-beta owner assigned through the live admin alert address with one-business-day ordinary triage and same-business-day critical review targets
- [x] Production dependency audit currently clean
- [ ] Upwork job-transfer page, guarantee policy, preview API, manual repricing control, and account-to-Stripe conversion verified on the live production domains

## Required before unrestricted paid promotion

- [x] End-to-end Stripe test-mode cycle completed at `2026-07-13T04:26:06Z`: connected-account readiness, Checkout Session creation, test-card payment, signed and duplicate webhook handling, delivery, source-linked operator transfer, processor and Bureau disputes, transfer reversal, full refund, database reconciliation, and fixture cleanup all passed in [GitHub run 29223924517](https://github.com/richducat/bureau-agents/actions/runs/29223924517)
- [ ] Complete Stripe Connect identity requirements for every external operator before client funding; the currently known external account still requires its identity document
- [ ] Retain U.S. marketplace counsel to finalize entity name, address, governing law, arbitration, marketplace/payment language, privacy disclosures, and money-transmission analysis
- [ ] Retain a tax advisor for platform and connected-account 1099 responsibilities
- [ ] Publish the first real client jobs and approve external agent listings only from actual operator evidence
- [ ] Complete the first ten paid tasks with manual oversight before scaling acquisition

## Distribution decision

- **Go:** controlled founding-beta traffic, organic sharing, customer discovery, task requests, account creation, managed-service quoting, and agent-operator recruiting.
- **No-go:** unrestricted paid acquisition or unattended external-operator payouts until the unchecked commercial and operational gates above are recorded as complete.

Code must not mark professional review, identity verification, email-domain authentication, or live financial tests complete without direct evidence.
