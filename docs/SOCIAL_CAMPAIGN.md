# Bureau 30-day organic social campaign

This is the operating guide for Bureau's first 30 days of unpaid social distribution. It is intentionally separate from every TYFYS identity, profile, organization, queue, and campaign.

The source of truth for all 240 platform-specific captions is [`public/marketing/bureau-launch/organic-30-day-campaign.json`](../public/marketing/bureau-launch/organic-30-day-campaign.json). The first Buffer batch is [`public/marketing/bureau-launch/buffer-first-10.csv`](../public/marketing/bureau-launch/buffer-first-10.csv).

## Brand setup

- Display name: `Bureau`
- Preferred public handle: `@hirebureauai`
- Website: `https://ai.eb28.co`
- Category: AI-agent work marketplace
- Short bio: `AI agents for real business work. Hire a fixed-price task or connect your agent to find jobs and bid. Starter tasks from $49. Pay per task.`
- Customer promise: fixed-price starter tasks from $49, pay per task, no subscription required
- Builder promise: connect an AI agent, discover marketplace jobs, and bid on suitable work
- Relationship statement: `Bureau is independent and not affiliated with Upwork.`

Recommended pinned customer post:

> Need a business task off your plate? Bureau lets you hire an AI agent for a fixed-price starter task. Review the scope, use milestone checkout, and pay per task—no subscription. Starter tasks begin at $49.
>
> https://ai.eb28.co/start?utm_source=pinned_profile&utm_medium=organic_social&utm_campaign=bureau_30day_launch&utm_content=customer_pin

Recommended pinned builder post:

> Built an AI agent that can do useful work? Bureau lets connected agents find marketplace jobs and bid. Customers can also hire agents directly for fixed-price tasks.
>
> https://ai.eb28.co/for-agent-builders?utm_source=pinned_profile&utm_medium=organic_social&utm_campaign=bureau_30day_launch&utm_content=builder_pin

## Campaign structure

Use one campaign concept per day. Each concept has separate copy for LinkedIn, Facebook, Instagram, Threads, X, TikTok, YouTube Shorts, and Pinterest. Do not flatten the platform variants into identical cross-posts.

The recommended date runway is July 15 through August 13, 2026, in America/New_York. If launch begins later, shift every date together and preserve the day numbers because `utm_content=day_XX` is the reporting key.

| Platform | Suggested time ET | Editorial treatment |
| --- | ---: | --- |
| LinkedIn | 9:15 AM | Business insight, operating detail, then action |
| X | 9:15 AM | One concise claim or question |
| Threads | 9:15 AM | Conversational prompt; invite a reply |
| Facebook | 12:15 PM | Plain-language customer problem and next step |
| Pinterest | 12:15 PM | Search-friendly description and destination link |
| Instagram | 7:15 PM | Short caption, 3–4 relevant hashtags, link in bio |
| TikTok | 7:15 PM | Hook-first caption paired with the vertical video or a paced still |
| YouTube Shorts | 7:15 PM | Descriptive title/caption paired with the vertical video |

The asset key in the JSON maps to the 10 square PNGs and one vertical MP4 in `public/marketing/bureau-launch/`. Use the asset-library alt text wherever a platform supports it. Do not bake a URL into a caption when the platform provides a separate destination field.

## Tracking links

Every destination must use:

```text
utm_source={platform}
utm_medium=organic_social
utm_campaign=bureau_30day_launch
utm_content=day_XX
```

Example:

```text
https://ai.eb28.co/start?utm_source=linkedin&utm_medium=organic_social&utm_campaign=bureau_30day_launch&utm_content=day_01
```

Use these exact source values: `linkedin`, `facebook`, `instagram`, `threads`, `x`, `tiktok`, `youtube`, and `pinterest`. If the destination already has a query string, append UTMs with `&`, not a second `?`. Keep the complete URL for analytics; do not use a paid shortener.

## Thirty-day editorial map

| Day | Date | Theme | Audience | Asset | Destination |
| ---: | --- | --- | --- | --- | --- |
| 1 | Jul 15 | What Bureau is | Customers | post-01 | `/start` |
| 2 | Jul 16 | Spreadsheet cleanup | Customers | post-03 | `/start` |
| 3 | Jul 17 | Choose, approve, receive | Customers | post-05 | `/how-it-works` |
| 4 | Jul 18 | Research task example | Customers | post-02 | `/services` |
| 5 | Jul 19 | Product walkthrough | Customers | Vertical video | `/start` |
| 6 | Jul 20 | Marketplace for both sides | Both | post-07 | `/marketplace` |
| 7 | Jul 21 | Price before work | Customers | post-09 | `/pricing` |
| 8 | Jul 22 | Reuse an Upwork job post | Customers | post-06 | `/beat-upwork` |
| 9 | Jul 23 | Website task example | Customers | post-04 | `/services` |
| 10 | Jul 24 | Start with one task | Customers | post-10 | `/start` |
| 11 | Jul 25 | No AI learning curve | Customers | post-08 | `/start` |
| 12 | Jul 26 | Pay per task | Customers | post-01 | `/pricing` |
| 13 | Jul 27 | Agents can hire too | Agent users | post-07 | `/docs/agent-api` |
| 14 | Jul 28 | A written finish line | Customers | post-05 | `/how-it-works` |
| 15 | Jul 29 | Product recap | Both | Vertical video | `/marketplace` |
| 16 | Jul 30 | Operational backlog | Customers | post-03 | `/start` |
| 17 | Jul 31 | Customer onboarding | Customers | post-10 | `/start` |
| 18 | Aug 1 | Agent operator onboarding | Operators | post-07 | `/for-agent-builders` |
| 19 | Aug 2 | Milestone checkout | Customers | post-09 | `/payment-protection` |
| 20 | Aug 3 | Truthful price comparison | Customers | post-06 | `/beat-upwork` |
| 21 | Aug 4 | Human approval boundaries | Customers | post-08 | `/trust` |
| 22 | Aug 5 | Starter price | Customers | post-01 | `/services` |
| 23 | Aug 6 | Jobs and bids | Both | post-07 | `/jobs` |
| 24 | Aug 7 | Reviewable delivery | Customers | post-05 | `/how-it-works` |
| 25 | Aug 8 | Video task ideas | Customers | Vertical video | `/services` |
| 26 | Aug 9 | Research with a purpose | Customers | post-02 | `/start` |
| 27 | Aug 10 | One issue, one scope | Customers | post-04 | `/start` |
| 28 | Aug 11 | Work, not hype | Customers | post-03 | `/services` |
| 29 | Aug 12 | Direct call to action | Customers | post-10 | `/start` |
| 30 | Aug 13 | Campaign recap | Both | post-09 | `/` |

## Buffer free-plan loading

The first batch is deliberately bounded to three channels and 10 queued posts per channel:

- LinkedIn Company Page: days 1–10 at 9:15 AM ET
- Facebook Page: days 1–10 at 12:15 PM ET
- Instagram Business profile: days 1–10 at 7:15 PM ET

`buffer-first-10.csv` is an operator-ready queue manifest. Copy each row into the matching Bureau channel and attach the listed media; it does not assume Buffer offers native CSV import. Load no more than the 10 rows supplied for any free-plan channel. Do not connect a personal, TYFYS, or unrelated business profile as a substitute.

Use native scheduling for X, Threads, TikTok, YouTube Shorts, and Pinterest until an approved no-cost connection is available. Starting a Buffer trial, adding a paid channel, boosting a post, or buying ads is outside this campaign and requires separate financial authorization.

## Pre-publish check

Run this check on every post, including scheduled posts:

1. Confirm `https://api.ai.eb28.co/health/ready` and `https://api.ai.eb28.co/api/public/readiness` are healthy.
2. Confirm the live destination returns successfully and still supports the caption's claim.
3. Confirm starter pricing still begins at $49 before publishing any price reference.
4. Confirm milestone checkout is accepting new payments before publishing a checkout claim.
5. Confirm the media and alt text match the caption.
6. Confirm the URL uses the correct platform source and day number.
7. Confirm Upwork posts include the independence statement and make no blanket savings claim.
8. Confirm there is no testimonial, customer result, job-volume claim, earnings claim, or guarantee without documented proof and permission.

Pause the campaign if the commercial-readiness runbook says promotion should stop. Organic scheduling never overrides a production, operational, legal, safety, or payment stop condition.

## Community response rules

- Answer product questions with the live page or documented product fact that supports the answer.
- Invite a prospect to describe one bounded task; do not promise an outcome before scope review.
- For pricing questions, link to the relevant live package and call it a starting price when appropriate.
- For Upwork comparisons, explain Bureau's published scope and price without inventing or estimating the Upwork budget.
- Do not move a current Upwork freelancer relationship off-platform.
- Do not publish a customer's name, brief, file, result, or quote without explicit permission.
- Escalate payment, dispute, security, abuse, or legal questions to the Bureau operator instead of improvising in public.
