# Bureau marketplace tax review packet

This packet organizes facts and questions for a qualified tax advisor. It is not tax advice and does not record approval.

## Current commercial model

- Customers may buy bounded managed services, directly hire a published agent package, or accept a marketplace milestone bid.
- Bureau plans to charge a percentage client service fee on funded work.
- Bureau plans to retain a percentage operator payout fee from external operator work.
- Optional recurring client and operator plans and a one-time agent-verification product exist in code but are disabled during founding beta.
- Stripe Checkout and Stripe Connect provide payment and connected-account infrastructure.
- Bureau stores integer-cent fee, payment, processor-fee, transfer, refund, and dispute records.

The final operating entity, federal tax classification, state registrations, accounting method, fiscal year, and banking arrangement must be supplied by the operator and confirmed by the advisor.

## Questions requiring written disposition

- Which party is merchant of record for managed desks, direct hires, and marketplace transactions?
- Which gross and net amounts are Bureau revenue versus pass-through operator amounts?
- What federal information-reporting duties apply to connected accounts, including Forms 1099-K, 1099-NEC, or other forms, and which duties Stripe performs versus Bureau?
- What W-9, W-8BEN, W-8BEN-E, TIN matching, backup withholding, sanctions, and record-retention controls are required before payout?
- Which states or localities treat the services, marketplace fees, subscriptions, or verification product as taxable?
- Where does Bureau have sales-tax nexus, marketplace-facilitator duties, income/franchise-tax nexus, or registration obligations?
- How should refunds, chargebacks, transfer reversals, credits, promotional discounts, and processor fees be recorded?
- How should complimentary beta work, test-mode transactions, and founder-funded work be separated from real revenue?
- Are external operators independent contractors, vendors, or another classification for tax reporting, and what documentation supports that treatment?
- What international customer or operator withholding, VAT/GST, permanent-establishment, or digital-services obligations apply before non-U.S. expansion?

## Records available for review

- Organization and user identity records
- Contract and milestone work values
- Client and operator fee basis points
- Stripe customer, account, Checkout, PaymentIntent, charge, transfer, refund, and dispute identifiers
- Processor-fee and net-settlement reconciliation fields
- Immutable audit events and webhook receipt records
- Terms-acceptance version and timestamp

## Evidence required before marking tax review complete

- Dated written advice identifying the advisor and covered jurisdictions
- Confirmed entity tax classification and accounting treatment for each money flow
- Written information-reporting responsibility matrix for Bureau and Stripe
- Required onboarding tax forms and payout holds documented
- Sales-tax/nexus decision with registration and filing actions, if any
- Chart-of-accounts and reconciliation procedure approved for production
- Named owner and calendar for filings, deposits, notices, and annual forms

Only after those records exist may `TAX_REVIEW_COMPLETED=true` be considered. `COMMERCIAL_PAYMENTS_ENABLED=true` is a separate, final operator decision made only after legal, tax, processor, identity, and operational evidence is complete.
