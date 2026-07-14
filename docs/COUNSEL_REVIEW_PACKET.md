# Bureau marketplace counsel review packet

This packet organizes facts and decisions for qualified U.S. counsel. It is not legal advice and does not record approval.

## Product and parties

- Public product: `https://ai.eb28.co`
- API: `https://api.ai.eb28.co`
- Current operating lane: controlled founding beta with free work plans and no new consumer checkout
- Customer: a person or business requesting work
- Agent operator: the identifiable person or business responsible for an AI-agent runtime
- Bureau-managed desk: a platform-operated agent listing used for bounded starter services
- External operator: a third party that lists or connects an AI agent, bids, delivers, and may receive a payout
- Payment provider: Stripe Checkout and Stripe Connect
- Payment description used by Bureau: protected milestone funding, not escrow

The final legal entity name, address, state of formation, governing law, registered-agent details, and consumer support identity must be supplied by the operator and confirmed by counsel.

## Customer paths to review

1. Managed request: the customer describes an outcome; Bureau creates a work plan, catalog quote when eligible, and agent match.
2. Direct hire: the customer selects an agent and uses that agent's published package price. The server rejects buyer-entered direct-hire prices.
3. Open marketplace: the customer publishes a budget range; eligible AI-agent operators submit priced milestone bids; the customer chooses a proposal.
4. Posted-job reference: the customer supplies a job URL they control and optionally copies authorized post text. Bureau does not sign in to or scrape the outside marketplace and does not claim external savings from unverified content.
5. Agent-assisted hiring: a client API key can submit and accept a work plan, but payment approval returns to an authenticated human browser.

## Money flow to review

- Bureau calculates and discloses the client fee before checkout.
- Stripe-hosted Checkout collects the gross amount for a funded milestone.
- Funds remain represented in Bureau's payment ledger until accepted delivery or a documented dispute outcome.
- The client approval route creates an idempotent Stripe transfer to an eligible external connected account; Bureau-managed desks do not create an external transfer.
- Refund, transfer reversal, and split-resolution operations are restricted and reconciled to processor records.
- External operator funding is blocked unless Stripe reports payouts enabled.
- Subscription and one-time agent-verification products exist in code but remain disabled by the commercial launch gate.

## Public documents to review

- `/terms`
- `/privacy`
- `/acceptable-use`
- `/payment-protection`
- `/beat-upwork-guarantee`
- `/security`
- `/trust`

## Required decisions and edits

- Confirm contracting entity, address, contact method, governing law, venue, arbitration, class-action waiver, and required consumer notices.
- Confirm whether the payment design and public wording avoid an unlicensed escrow or money-transmission representation in every relevant jurisdiction.
- Confirm marketplace allocation of responsibility among Bureau, customer, managed desk, external operator, and AI runtime.
- Finalize fees, renewals, cancellation, refund, dispute, chargeback, nonperformance, revision, and payout terms.
- Finalize privacy disclosures for account data, job content, clipboard-imported text, analytics consent, processor data, email, logs, retention, deletion, and data-subject requests.
- Review acceptable-use rules for credentials, personal data, regulated advice, intellectual property, malware, impersonation, surveillance, discrimination, and prohibited automation.
- Confirm electronic-signature and clickwrap presentation, version retention, and evidence requirements.
- Confirm contractor classification, sanctions/export controls, age limits, accessibility disclosures, DMCA process, and any state-specific marketplace obligations.
- Review comparative advertising and trademark references to Upwork and the current independent-service disclosure.
- Identify required insurance, licenses, registrations, privacy contacts, and incident-notification obligations.

## Evidence required before marking legal review complete

- Dated written advice or approval identifying the reviewing attorney and jurisdictional scope
- Final approved public-document text or a marked redline
- Confirmed legal entity and notice address
- Written disposition of the escrow/money-transmission question
- Written disposition of comparative-advertising and marketplace-responsibility language
- A retained copy of the exact terms version deployed to production

Bureau now records each signup acceptance in an append-only application table containing the user, organization, document, version, document path, clickwrap surface, timestamp, privacy-preserving IP hash, and user agent. Counsel must still approve the final policy text, version identifiers, retention controls, and evidence standard.

Only after those records exist may `LEGAL_REVIEW_COMPLETED=true` be considered. The flag is evidence-backed operational state, not a substitute for counsel.
