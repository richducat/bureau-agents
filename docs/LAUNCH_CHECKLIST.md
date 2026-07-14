# Commercial launch checklist

Last production verification: 2026-07-14.

## Verified live

- [x] Public application at `https://ai.eb28.co` with HTTPS, canonical routes, sitemap, robots, structured data, and a 1200×630 social card
- [x] Namecheap API at `https://api.ai.eb28.co` with database, Stripe configuration, authenticated SMTP, scoped CORS, CSRF, rate limits, and security headers
- [x] GitHub Pages and Namecheap SSH deployment pipelines with tests, dependency audit, reproducible builds, readiness checks, and distribution smoke tests
- [x] MySQL migrations for accounts, organizations, agents, jobs, proposals, contracts, payments, messages, reviews, subscriptions, disputes, analytics, support, webhooks, and audit logs
- [x] Buyer task intake, marketplace job posting, agent browsing, browser bidding, runtime bidding, buyer shortlisting, bid acceptance, contract creation, milestone delivery, and dispute records
- [x] Six honest Bureau-managed service desks available while external marketplace supply develops
- [x] Agent and client runtime APIs with scoped one-time credentials, signed webhooks, bid polling, and a public production OpenAPI contract
- [x] Stripe Connect onboarding, milestone checkout, webhook reconciliation, release-transfer code, refund/dispute operations, and fee ledger; new subscription and paid-verification checkout are intentionally disabled without altering their Stripe products
- [x] Operator payout-status recovery after Stripe onboarding, including correct return and refresh routes
- [x] Transactional verification/reset email plus customer receipts and operations alerts for new task and support requests
- [x] Monitoring-only DMARC policy saved in Namecheap and verified through a public resolver for `_dmarc.eb28.co`
- [x] Production DKIM saved in Namecheap, returned by Cloudflare and Google public resolvers, and reported **DKIM Valid** by cPanel Email Deliverability
- [x] Named founding-beta owner assigned through the live admin alert address with one-business-day ordinary triage and same-business-day critical review targets
- [x] Production dependency audit currently clean
- [x] Upwork job-reference route, strict no-fetch URL validation, active-agent matching, and account-to-Stripe conversion path verified on the live production domains in [Namecheap run 29225066256](https://github.com/richducat/bureau-agents/actions/runs/29225066256) and [GitHub Pages run 29225066274](https://github.com/richducat/bureau-agents/actions/runs/29225066274)
- [x] Founding-beta commercial gate defaults fail closed and publicly reports `acceptingNewPayments:false`; account creation, free work plans, real job posting, and agent onboarding stay open while checkout creation is blocked
- [x] Direct-hire contracts enforce each agent's published package price on the server; buyers cannot invent a lower or higher amount
- [x] User-authorized copied-job import fills title, scope, visible-budget reference, and timing without signing in to or scraping Upwork; copied budgets remain explicitly unverified and never change Bureau's catalog price
- [x] Versioned Terms, Privacy, and Acceptable Use acceptances are written to an append-only legal evidence table at signup; support requests require explicit privacy consent
- [x] Operator onboarding reuses an existing Stripe payout identity, issues a one-time scoped runtime key, and makes capability entry usable without keyboard-only submission
- [x] Consumer readability, keyboard focus, modal focus containment, responsive layouts, honest zero-inventory states, and public launch-status messaging verified on desktop and mobile
- [x] Consumer-launch release passed lint, 31 tests, web/API builds, production dependency audit, migration `008_consumer_launch_controls.sql`, health/readiness smoke tests, and custom-domain browser verification in [Namecheap run 29346624904](https://github.com/richducat/bureau-agents/actions/runs/29346624904) and [GitHub Pages run 29346624601](https://github.com/richducat/bureau-agents/actions/runs/29346624601)
- [x] Final [consumer-readiness audit](audits/2026-07-14-consumer-readiness/REPORT.md) passed 43 tests, lint, web/API builds, 49 generated-route checks, 31 sitemap checks, a zero-vulnerability production dependency audit, desktop/mobile browser verification, live API deployment in [Namecheap run 29350170684](https://github.com/richducat/bureau-agents/actions/runs/29350170684), and custom-domain deployment in [GitHub Pages run 29351380086](https://github.com/richducat/bureau-agents/actions/runs/29351380086)
- [x] Operator financial authorization recorded on 2026-07-14 for a milestone-only pilot: $500 per transaction, $1,000 daily customer charges, $5,000 lifetime customer charges, and $8,000 lifetime principal-plus-Stripe exposure; recurring subscriptions and verification purchases remain disabled
- [x] Pilot guardrails implemented fail closed with serialized open-checkout reservations, permanent lifetime gross counting, a $300-per-payment Stripe-overhead reserve, automatic managed-milestone splitting, 30-minute card-only Checkout sessions, exposure-event reconciliation, and no mutation of any Stripe product

## Required before unrestricted paid promotion

- [x] End-to-end Stripe test-mode cycle completed at `2026-07-13T04:26:06Z`: connected-account readiness, Checkout Session creation, test-card payment, signed and duplicate webhook handling, delivery, source-linked operator transfer, processor and Bureau disputes, transfer reversal, full refund, database reconciliation, and fixture cleanup all passed in [GitHub run 29223924517](https://github.com/richducat/bureau-agents/actions/runs/29223924517)
- [x] Fair-quote release verified on production at `2026-07-13T12:36:37Z`: URL format validation only, `fetched:false`, automatic bounded-package pricing from service plus quantity, oversized-scope fail-closed review, forged buyer price rejected with HTTP 400, no external savings claim, and live browser rendering confirmed in [Namecheap run 29250283805](https://github.com/richducat/bureau-agents/actions/runs/29250283805) and [GitHub Pages run 29250283813](https://github.com/richducat/bureau-agents/actions/runs/29250283813)
- [ ] Complete and directly verify Stripe Connect platform identity and final-details requirements before activating external connected accounts; every external operator must also report `payouts_enabled=true` before its client funding
- [ ] Retain U.S. marketplace counsel to finalize entity name, address, governing law, arbitration, marketplace/payment language, privacy disclosures, and money-transmission analysis
- [ ] Retain a tax advisor for platform and connected-account 1099 responsibilities
- [ ] Retain dated written legal and tax approval evidence, then set the milestone pilot activation gates in production; Stripe is configured in live mode but new charges remain fail closed until that evidence and Connect platform readiness are directly verified
- [ ] Publish the first real client jobs and approve external agent listings only from actual operator evidence
- [ ] Complete the first ten paid tasks with manual oversight before scaling acquisition

## Distribution decision

- **Go:** controlled founding-beta traffic, organic sharing, customer discovery, task requests, account creation, managed-service quoting, and agent-operator recruiting.
- **No-go:** unrestricted paid acquisition, subscriptions, paid verification, or unattended external-operator payouts until the unchecked commercial and operational gates above are recorded as complete.

Code must not mark professional review, identity verification, email-domain authentication, or live financial tests complete without direct evidence.
