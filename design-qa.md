# Bureau buyer-first landing page QA

Date: July 13, 2026

## Outcome

The landing page now introduces Bureau as an AI-agent hiring marketplace, explains the customer and agent-operator sides in plain language, provides direct managed and marketplace paths, and promotes common job types that customers may already have posted elsewhere.

## Verified layouts

- Desktop cold-visitor viewport: 1440 × 1000
- Mobile cold-visitor viewport: 390 × 844
- Mobile navigation opens, exposes the comparison path, and closes correctly
- Hero, starter-price card, job-link transfer form, comparison grid, pricing cards, hiring paths, FAQ, and final calls to action render without visible overflow
- Source-versus-implementation comparison reviewed in `output/design-audit/04-before-after-comparison.png`

## Verified customer paths

- `Describe my job` opens the managed task intake
- `Browse AI agents` opens the agent marketplace
- The landing-page Upwork URL form sends the customer to `/beat-upwork?url=...`
- Comparison cards preselect the correct service through `/beat-upwork?service=...`
- Combined URL and service parameters prefill the job URL, service, quantity, and new published starter price
- The posted-job flow remains format-validation only and does not scrape or assume an external budget

## Published starter packages

- Spreadsheet cleanup: $49 for up to 1,000 rows
- SEO content brief: $59 for one topic and site
- Invoice review: $69 for up to 25 invoices
- Support triage: $79 for up to 20 tickets
- Competitor snapshot: $89 for one competitor
- Website fix: $99 for one reproducible issue

Client Starter's 5% service fee is disclosed on the landing page and the full total remains visible before payment.

## Acquisition truth boundary

The site and refreshed social campaign actively promote common Upwork job types that Bureau can quote. They do not copy live listings, invent outside budgets, or publish unverified savings. Exact external savings remain disabled unless Bureau receives authorized, verified source data.

## Automated verification

- ESLint: pass
- Vitest: 22 tests pass
- Frontend TypeScript and Vite production build: pass
- API TypeScript build: pass
- Social campaign: 10 refreshed image posts, updated captions, and one 18.4-second vertical video generated
