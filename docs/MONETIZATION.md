# Bureau monetization model

## Launch motion: managed work first

The buyer-facing product launches as a managed AI work desk, not an empty self-serve exchange. A visitor submits a free task request, Bureau reviews it in the admin request queue, returns a scope and quote, and converts accepted work into the existing marketplace contract and milestone workflow.

This changes acquisition and service operations without discarding the marketplace economics underneath:

1. A buyer submits a free request at `/start`.
2. Bureau qualifies the work and confirms deliverables, permissions, timing, and price.
3. Bureau selects or recruits the right accountable agent operator.
4. The client funds the scoped milestone.
5. Bureau reviews the delivery record and the client accepts the result.
6. Bureau earns the client fee plus operator payout fee when the payment is settled and released.

The public site shows buyer prices and fees only. Owner contribution economics remain in this private operating document and the restricted admin revenue ledger.

## Acquisition lane: transfer an Upwork job reference

`/beat-upwork` turns an existing client job post into a high-intent Bureau work request:

1. The authorized client supplies an Upwork job URL, selects a Bureau service, and enters the work quantity in that service's published unit. Bureau normalizes and format-validates the URL locally; it never fetches or scrapes the Upwork page.
2. Bureau calculates whole package count from the service's published capacity, multiplies it by the published package rate, and matches an active managed agent. The buyer does not enter a price or comparison amount.
3. If the quantity exceeds the service's automatic maximum, the scope is outside the displayed inclusions, or an active-agent match is unavailable, the request fails closed into manual review without a payable quote or savings claim.
4. The client creates or opens an account with the same email, approves the recorded scope, and funds through the normal Stripe milestone workflow.

For Bureau-owned service desks, the platform organization is the accountable operator. The fee engine assigns the platform operator a 100% operator fee, so the work value and client service fee become Bureau gross revenue; model/runtime usage, review labor, refunds, support, taxes, and overhead still reduce contribution. For external marketplace agents, the standard 10% or 7% operator fee applies instead.

The Upwork URL is a client-supplied scope reference, not pricing evidence. Bureau does not claim that its catalog quote is cheaper than an Upwork budget, proposal, contract, or total price. A true external-price comparison must remain disabled unless Bureau receives written authorization for a reliable source and verifies the comparison server-side under an approved policy.

## The commercial model

Bureau earns when AI-agent work succeeds. Recurring revenue and paid agent verification remain future products and are not purchasable during the milestone pilot.

| Revenue stream | Starter price | Paid-tier price | When Bureau earns |
|---|---:|---:|---|
| Client marketplace fee | 5% of work value | 3% on Client Scale | When a milestone is funded |
| Agent-operator payout fee | 10% of work value | 7% on Operator Pro | When a client approves and Bureau releases operator net |
| Operator Pro | — | $49/month future price | Disabled during pilot; existing subscriptions remain manageable |
| Client Scale | — | $149/month future price | Disabled during pilot; existing subscriptions remain manageable |
| Agent verification review | — | $99 future price | Disabled during pilot; evidence review does not require a purchase |
| Featured placement | Not enabled at launch | Future, clearly disclosed | Optional acquisition product after organic marketplace liquidity exists |

Bureau has no contract-initiation fee and no proposal-credit system. Joining and publishing the first listing are free.

## One $400 Starter pilot transaction

The production fee engine stores integer cents and locks the fee basis points into the contract when it is created. A Starter milestone can have at most $476.19 in work value because its 5% client fee brings the customer charge to the $500 pilot ceiling.

| Line | Amount |
|---|---:|
| Work value | $400.00 |
| Client fee (5%) | $20.00 |
| Client pays | $420.00 |
| Operator fee (10%) | $40.00 |
| Operator receives | $360.00 |
| Bureau gross revenue | $60.00 |
| Estimated U.S. domestic-card processing (2.9% + $0.30) | $12.48 |
| Estimated Connect variable payout cost (0.25% + $0.25) | $1.15 |
| Estimated contribution before the active-account fee, disputes, support, hosting, tax, and overhead | $46.37 |

Ten comparable transactions would create $4,200 in customer charges, $600 in gross marketplace revenue, and roughly $463.70 in contribution before the other costs above. The pilot stops earlier whenever its daily, lifetime, or exposure ceiling is reached. This is an example, not a forecast.

## Future paid-plan economics

| Line | Amount |
|---|---:|
| Client pays (3% fee) | $1,030.00 |
| Operator receives (7% fee) | $930.00 |
| Bureau gross transaction revenue | $100.00 |
| Estimated processing and variable payout cost | $32.75 |
| Estimated transaction contribution before active-account fee and overhead | $67.25 |
| Additional recurring revenue from both plans | $198/month |

These economics are retained for future planning only. The paid plans deliberately reduce transaction margin in exchange for predictable MRR, higher retention, team controls, more agents, and higher marketplace volume, but no new paid-plan checkout can be created during the pilot.

## Why this pricing is competitive

Upwork currently displays a 5% Basic client service fee, a variable freelancer service fee from 0% to 15%, and a per-contract initiation fee from $0.99 to $14.99. Bureau launches with the same headline client fee, a clear 10% operator fee, and no initiation fee. Sources: [Upwork client pricing](https://www.upwork.com/pricing/client), [Upwork freelancer fee](https://support.upwork.com/hc/en-us/articles/211062538-Learn-about-the-Freelancer-Service-Fee), and [Upwork contract initiation fee](https://support.upwork.com/hc/en-us/articles/26106318334611-What-is-the-Contract-Initiation-Fee-on-Upwork).

Stripe currently lists U.S. card payments starting at 2.9% + $0.30 and, when the platform controls connected-account pricing, $2 per monthly active account plus 0.25% + $0.25 per payout. Source: [Stripe Connect pricing](https://stripe.com/connect/pricing).

## What to optimize after launch

Track these metrics from the built-in event and payment ledgers:

1. Visitor → task-intake start.
2. Task-intake start → submitted request.
3. Submitted request → qualified scope.
4. Qualified scope → quote accepted.
5. Accepted quote → funded contract.
6. Funded contract → accepted delivery.
7. Time spent scoping and reviewing each managed request.
8. Gross margin after processing, operator payout, disputes, support, and managed-service labor.
9. Client account → repeat task.
10. Operator account → first active agent.
11. Job → first qualified proposal time.
12. Gross marketplace volume, Bureau gross take, actual Stripe cost, refunds, chargebacks, and contribution.
13. 30/60/90-day repeat client and operator retention.
14. Subscription attach rate and fee savings per paid account.
15. Upwork-transfer page → URL-validation success, bounded-package quote availability, scope completion, account creation, funding, and accepted delivery.
16. Package-quote-to-funding conversion, manual-review share, and contribution after managed-agent delivery cost.

Do not buy traffic aggressively until task requests receive a reliable human response, quotes convert, and delivery quality is repeatable in at least two task categories. Managed proof comes before marketplace liquidity; marketplace liquidity comes before paid acquisition scale.
