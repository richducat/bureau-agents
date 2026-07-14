# Posted-job acquisition system

## Live customer path

- Landing-page job-link form: `https://ai.eb28.co/#compare-a-job`
- Posted-job quote: `https://ai.eb28.co/beat-upwork`
- Fair Quote Policy: `https://ai.eb28.co/beat-upwork-guarantee`
- Social campaign: `https://ai.eb28.co/marketing/bureau-launch/`

The landing page and social campaign advertise common job types customers may have posted on Upwork, with Bureau's own published starter prices. A customer can paste a job URL they control, preselect the closest package, receive the automatic Bureau catalog price, copy the visible post once, and let Bureau fill the title, description, visible budget reference, and timing. During founding beta the customer continues to a saved work plan; checkout remains disabled until the commercial launch gate is complete.

## Attribution

The acquisition paths use these campaign values:

- Landing form: `utm_source=landing_hero`
- Landing comparison cards: `utm_source=landing_comparison`
- Social comparison creative: `utm_source=social`
- Campaign: `utm_campaign=posted_job_price_check`

The submitted request stores the source, campaign, and content values in its bounded `source` field. The landing form also records a `cta_clicked` event with the `posted_job_quote` action after analytics consent.

## Truth boundary

Bureau may advertise its own package price and scope. It must not publish an external budget, discount, or savings number unless the source is authorized and verified.

Current production behavior:

- Validates supported Upwork job URL format locally
- Does not fetch or scrape the page
- Can parse only job text the customer deliberately copies into Bureau or permits Bureau to read from the browser clipboard
- Does not assume the Upwork budget, proposal prices, or job details
- Labels a budget found in copied text as unverified and never uses it to set Bureau's price or claim savings
- Does not let a customer invent the Bureau package price
- Shows only Bureau's published catalog price when external comparison data is unavailable
- Keeps an independent-service and trademark notice next to the comparison path

## Why the marketing feed uses job types instead of copied live listings

Upwork's official developer documentation exposes OAuth-protected marketplace job search, but production use requires approved API permissions. Upwork's current API-key guidance also says the API is not available for commercial use. Bureau therefore does not use an unapproved commercial API feed or a scraper for competitor listings.

Official references:

- [Upwork API documentation](https://www.upwork.com/developer/documentation/graphql/api/docs/index.html)
- [Upwork API-key requirements](https://support.upwork.com/hc/en-us/articles/115015857647-How-to-request-an-API-key-from-Upwork)

## Upgrade gate for verified comparisons

Enable external budget and savings fields only after one of these is documented:

1. Upwork gives Bureau written commercial or partner permission for the exact production use.
2. A customer supplies a verifiable export through an authorized integration that permits the comparison.
3. Counsel approves another documented source and use path.

The future source record should store the external job ID, authorized account, exact budget, currency, source method, verification time, content hash, and expiration. A comparison must fail closed when any required field is missing, expired, or inconsistent.
