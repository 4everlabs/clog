# PostHog Dashboard Critique

Generated: April 17, 2026

This writeup is based on a live PostHog dashboard inspection plus the local PostHog dashboard snapshot logic in this repo. The dashboard is not bad because PostHog is bad. It is bad because the current information architecture is trying to make one screen answer every possible question at once. The result is a wall of charts that creates the feeling of measurement without giving a clear operating view of the product.

The short version: the dashboard is too dense, too duplicative, too visually flat, and too unclear about what decision each chart is supposed to drive. It tracks a lot, but it does not explain what matters. It shows activity, but it does not show whether the product is working.

## Executive Diagnosis

The current PostHog setup is failing as an operating dashboard for five main reasons:

- It has too many pinned dashboards with overlapping responsibilities.
- The main "source of truth" dashboard is a dense grid of equally weighted tiles.
- The dashboards mix executive metrics, onboarding debugging, AI usage, reliability, billing, content creation, and instrumentation coverage without enough hierarchy.
- The most important product question is not visually dominant: "Are new users successfully reaching the core value moment?"
- The dashboard shows many charts but few decisions, thresholds, owners, or next actions.

The result is predictable: you open PostHog, scan a large amount of visual noise, and leave without a confident answer about what to fix next.

## What Exists Right Now

There are seven pinned dashboards in the project:

- `4ever Prod - AI / Eve Deep Dive`
- `4ever Prod - Core Journey / Onboarding + Eve`
- `4ever Prod - Dense Product Truth`
- `4ever Prod - Executive / North Star`
- `4ever Prod - Reliability`
- `App metrics (app.4ever.ai)`
- `Landing page metrics (4ever.ai)`

This is already too many pinned starting points. A pinned dashboard should mean "this is operationally important right now." When all seven are pinned, pinning stops being a signal. The user has to decide which "truth" to trust before they can even begin diagnosing anything.

The naming also reveals the core issue:

- `Executive / North Star` sounds like the top-level operating view.
- `Core Journey / Onboarding + Eve` says it is the primary dashboard for onboarding health.
- `Dense Product Truth` says it is the source of truth.
- `App metrics` is older but still pinned.
- `AI / Eve Deep Dive` overlaps with both the core journey and dense dashboard.
- `Reliability` overlaps with the reliability section inside the dense dashboard.

There are too many dashboards claiming to be important. The current structure asks the user to know the answer before they open the tool.

## The Main Dashboard Problem

The `4ever Prod - Dense Product Truth` dashboard is the clearest example of the failure mode.

It has 17 tiles. Every tile is laid out as a same-sized `6 x 5` block in a two-column grid. That means the most important metric has the same visual weight as a supporting diagnostic. A top-level activation funnel gets the same space as profile photo skip reasons. AI generation volume gets the same weight as reliability failures. Content creation outcomes get the same weight as top app pages.

That is not a dashboard. That is an analytics junk drawer.

The dashboard description says to read it top-to-bottom:

1. tracked event coverage
2. app traffic and top pages
3. AI generation volume
4. onboarding and billing funnels
5. adult-path diagnostics
6. Eve activation
7. content creation
8. reliability failures
9. onboarding friction diagnostics

That sequence is logical in a README, but it is not how people use a dashboard under pressure. When someone opens an operational dashboard, they need the screen to answer:

- Is the product healthy?
- Where is the biggest leak?
- Is the problem acquisition, activation, monetization, content creation, AI, or reliability?
- What changed recently?
- What should I inspect next?

The current dashboard makes the user manually synthesize that answer from 17 tiles.

## Why It Feels Ugly

The dashboard feels ugly because it has no visual hierarchy.

Everything is the same size. Everything is a chart. Most tiles have long names. There are no strong section headers, no scorecards, no "read this first" block, no owner notes, and no obvious escalation states. The grid is technically organized, but visually it is a flat spreadsheet of charts.

Specific ugliness problems:

- Equal tile sizes imply equal importance, which is false.
- Long insight names make the page feel like an internal database, not an operating surface.
- Repeated bar charts and horizontal funnels create a visual rhythm where nothing stands out.
- The dashboard depends on descriptions hidden inside tiles instead of visible section-level framing.
- There are no obvious "good / bad / needs attention" states.
- There are no compact KPI cards at the top that say what changed.
- There are no visual separators between acquisition, activation, monetization, content, AI, and reliability.
- The dashboard is too vertically long, so the user loses context while scrolling.
- Diagnostic details are mixed into the same viewport as leadership-level questions.

The issue is not just aesthetics. The ugliness is functional. A messy dashboard makes the product feel more confusing than it is, slows diagnosis, and lowers trust in the data.

## Why You Cannot Get Anything Meaningful Out Of It

You cannot get meaning out of the dashboard because it mostly presents facts without a decision model.

For example, the dashboard can show:

- Daily active users.
- Top pages.
- Onboarding step funnels.
- Time to convert.
- Eve message counts.
- Reliability failures.
- Form validation failures.
- Photo skip reasons.

But it does not clearly say:

- Which of these is the current bottleneck?
- What threshold makes a number good or bad?
- Which metric matters this week?
- Which chart is the source of truth when two dashboards overlap?
- Whether a drop is a tracking issue, a real product issue, or a low-sample artifact.
- Whether leadership should care now, later, or not at all.

The dashboard gives you data points, not interpretation.

That is why it feels like you are looking at "analytics" rather than running the product.

## Live Signal: The Product Story Is Actually Pretty Clear

The dashboard is messy, but the product story underneath it is not that complicated.

A live 30-day key event query showed:

| Event | Total events | Unique users | Last seen |
| --- | ---: | ---: | --- |
| `auth_completed` | 273 | 27 | 2026-04-17 |
| `onboarding_intro_step_viewed` | 256 | 13 | 2026-04-16 |
| `onboarding_intro_started` | 84 | 25 | 2026-04-16 |
| `onboarding_intro_completed` | 30 | 15 | 2026-04-16 |
| `eve_onboarding_started` | 30 | 15 | 2026-04-16 |
| `eve_message_sent` | 37 | 4 | 2026-04-16 |
| `eve_response_completed` | 36 | 3 | 2026-04-16 |
| `billing_checkout_started` | 4 | 3 | 2026-04-16 |
| `photo_album_created` | 3 | 1 | 2026-03-23 |

The important story is not "we have 17 charts." The important story is:

- Auth is happening.
- Onboarding starts are happening.
- Roughly 15 users completed intro and reached Eve onboarding.
- Only 4 users sent an Eve message.
- Only 3 users got an Eve response.
- Checkout starts are tiny.
- `paid_conversion_confirmed` did not appear in the queried 30-day event set.
- Durable content creation is almost nonexistent in this result set.

That is the core operating story. The current dashboard buries it.

If these numbers are accurate, the highest-leverage question is probably not "what are the top app pages?" or "what are profile photo skip reasons?" It is:

> Why do users who complete onboarding and reach Eve not send a message, get a response, pay, or create durable family content?

If these numbers are not accurate, then the highest-leverage question is:

> Why is instrumentation failing to represent the product journey clearly?

Either way, the dashboard should make that obvious within five seconds. It currently does not.

## Live Signal: 24-Hour Health Snapshot

A 24-hour snapshot from the local dashboard snapshot logic showed:

| Metric | Value |
| --- | ---: |
| Pageviews | 669 |
| Unique visitors | 216 |
| Web vitals events | 185 |
| Exceptions | 2 |
| Distinct exception issues | 1 |
| Web vitals coverage | 27.7% |
| Error rate per 1k pageviews | 3.0 |
| Slow LCP pages | 0 |
| Slow INP pages | 0 |
| Production readiness score | 86 |

The only detected anomaly was weak web vitals coverage:

> Only 27.7% of pageviews included web vitals events.

This is another example of hidden meaning. The dashboard may show performance/reliability charts, but the most actionable interpretation is that performance coverage itself is thin. Low coverage means "no slow pages detected" is not the same as "the product is fast." It means "the available sample did not catch slow pages."

That distinction matters. A good dashboard would make it obvious.

## Specific Problems

### 1. There Are Too Many Starting Points

The dashboard list has seven pinned dashboards. The user has to choose between `Executive`, `Core Journey`, `Dense Product Truth`, `Reliability`, `AI / Eve Deep Dive`, and legacy `App metrics`.

This creates ambiguity:

- If activation is bad, should you open `Executive`, `Core Journey`, or `Dense Product Truth`?
- If Eve usage is bad, should you open `Core Journey`, `AI / Eve Deep Dive`, or `Dense Product Truth`?
- If reliability is bad, should you open `Reliability` or the dense dashboard reliability tile?
- If traffic is down, should you open `Executive`, `App metrics`, or the dense dashboard?

The dashboard set needs a clear primary route:

- Start here.
- Then go here if onboarding is broken.
- Then go here if Eve is broken.
- Then go here if reliability is broken.

Right now, the structure makes the operator do routing work.

### 2. The "Source Of Truth" Is Too Dense To Be True

`Dense Product Truth` tries to combine:

- Event coverage.
- Traffic.
- Top pages.
- AI generation volume.
- Onboarding path to paid.
- Time to paid.
- Billing checkout.
- Adult branch diagnostics.
- Eve activation.
- Eve navigation choices.
- Content creation.
- Reliability failures.
- Validation failures.
- Profile photo outcomes.
- Photo skip reasons.

That is not one dashboard. That is at least four dashboards:

- Executive health.
- Activation and onboarding diagnostics.
- Eve and AI diagnostics.
- Reliability and instrumentation diagnostics.

When everything is in one place, nothing is prioritized.

### 3. The Most Important Funnel Is Not Elevated Enough

For this product, the key user journey is not just "visited page" or "opened app." The core journey is:

1. User understands what 4ever is.
2. User signs up or authenticates.
3. User starts onboarding.
4. User completes enough family/profile context.
5. User reaches Eve.
6. User sends a first meaningful message.
7. Eve returns a useful response.
8. User creates or preserves durable content.
9. User pays or otherwise confirms value.
10. User returns.

The dashboard has many pieces of this, but it does not make the journey the spine of the page.

The top of the dashboard should not start with a coverage table. Coverage matters, but it is meta. The top should start with the product truth:

- New qualified visitors.
- Auth completed.
- Onboarding started.
- Onboarding completed.
- Eve reached.
- First Eve message.
- First Eve response.
- First durable memory/content.
- Paid conversion.
- Week 1 return.

Instrumentation coverage should be a warning layer, not the headline.

### 4. The Dashboard Confuses Activity With Success

Several current charts measure activity:

- DAU.
- Top pages.
- AI generation calls.
- Pageviews.
- Eve nav clicks.
- Validation failures.
- Photo skip reasons.

Activity is not success. Activity can go up because users are confused. Pageviews can go up because users are stuck. AI generation calls can go up because Eve is looping or producing low-quality output. Validation failures can go up because users are trying, but they can also mean the form is hostile.

The dashboard needs to distinguish:

- Success metrics: completion, conversion, durable content, paid access, return.
- Friction metrics: validation failure, skipped photo, checkout abandonment, response failure.
- Volume metrics: traffic, DAU, pageviews, AI calls.
- Data quality metrics: event coverage, sample size, stale events.

Right now these are mixed together, so every metric looks equally meaningful.

### 5. There Are Too Many Similar Funnel Tiles

The `Core Journey / Onboarding + Eve` dashboard has 17 tiles and repeats several funnel variations:

- Common onboarding path to paid.
- Common onboarding path time to paid.
- Adult onboarding path to paid.
- Adult branch around children.
- Onboarding to first Eve response funnel.
- Time to first Eve message.
- Time to first Eve response.
- Time to complete intro.
- Onboarding step milestones to paid.
- Intro start to paid conversion.
- Time intro start to paid.

These are not all wrong. Many are useful diagnostics. But placing them together at the same weight creates cognitive overload.

The right pattern is:

- One canonical activation funnel.
- One "where did users drop?" diagnostic.
- One "how long did it take?" diagnostic.
- One branch-specific drilldown.
- Everything else hidden behind a deep-dive dashboard.

The current pattern says: here are many slightly different ways to ask the same question. That is exhausting.

### 6. There Is No Clear Metric Ownership

A good operating dashboard makes ownership clear. It should be obvious which team or function owns each problem.

For example:

- Acquisition owns landing traffic and signup conversion.
- Product owns onboarding completion and first value.
- AI/product owns Eve message and response success.
- Engineering owns exceptions, sync failures, upload failures, and performance coverage.
- Growth/business owns checkout start and paid conversion.

The dashboard does not make this ownership visible. It groups by chart type and product area, but not by accountability.

That makes it harder to convert a metric into an action.

### 7. The Time Windows Are Too Uniform

Most dashboard tiles use `-30d`. That is useful for smoothing, but it is not enough for operations.

A good dashboard needs multiple time horizons:

- Last 24 hours: did something break?
- Last 7 days: is the recent release or campaign working?
- Last 30 days: what is the stable baseline?
- Cohort retention: do users come back after the first session?

The current dashboard leans heavily on 30-day views. That makes it harder to tell whether a problem is happening now or whether the dashboard is just showing historical mass.

The local snapshot code correctly uses short operational windows for traffic, exceptions, web vitals, and anomalies. That logic should be reflected in the dashboard itself.

### 8. The Dashboard Lacks Thresholds

A dashboard without thresholds is a chart gallery.

Examples of thresholds that should exist:

- Web vitals coverage below 80% is a data quality issue.
- First Eve response failure rate above 2% is a product trust issue.
- Onboarding completion below a target should be flagged.
- Checkout start to paid conversion below a target should be flagged.
- No `paid_conversion_confirmed` events in 24 hours or 7 days should trigger an alert or data-quality warning.
- Durable content creation below a target should be flagged.

The current dashboard mostly shows raw charts. It does not encode "this is acceptable" vs "this is broken."

### 9. Instrumentation Coverage Is Present But Not Actionable Enough

The dense dashboard starts with `Tracked event coverage (30d)`, which is directionally useful. But the coverage table has a structural problem: it only lists events in a known allowlist.

That means it can tell you which expected events are firing, but it does not automatically tell you:

- Which expected events are missing entirely unless the query is interpreted carefully.
- Which event names are malformed or duplicated.
- Which properties are missing.
- Which events are firing from staging or test contexts.
- Which critical events are stale.
- Which funnel steps are impossible because required properties are absent.

Coverage should be a dedicated instrumentation health section with explicit red/yellow/green states:

- Missing critical event.
- Missing required property.
- Event stale.
- Event firing from wrong environment.
- Test accounts included.
- Host mismatch.
- Funnel has too few samples.

Right now coverage is another table in the grid. It should be a gatekeeper for whether the dashboard can be trusted.

### 10. There Are Filter Consistency Risks

The dashboards appear to use several different filtering approaches:

- Some charts filter `properties.deploymentEnvironment = 'production'`.
- Some charts filter by `$current_url` containing `app.4ever.ai`.
- Some charts filter by `$host`.
- Some exact host filters reference `www.app.4ever.ai`.
- The AI generation chart in `Dense Product Truth` has `filterTestAccounts: false`, while most production charts have `filterTestAccounts: true`.

This is dangerous. Inconsistent filters create inconsistent truth.

If one chart includes test accounts and another excludes them, comparing them is unreliable. If one chart uses `$current_url` and another uses `$host`, hostname formatting differences can create silent gaps. If the real host is `app.4ever.ai` but some charts expect `www.app.4ever.ai`, the dashboard may undercount or misrepresent funnel steps.

Before making product decisions from the dashboard, filters need to be standardized.

### 11. The Executive Dashboard Is Too Small And Too Vague

The `Executive / North Star` dashboard has only five tiles:

- Onboarding completion funnel.
- Landing to dashboard funnel.
- Active users by cadence.
- App weekly retention.
- First content activation.

This is closer to the right level of detail, but it still does not answer the most important executive question clearly enough:

> Are users reaching the product's core value and coming back?

The executive dashboard should be a compact scorecard, not a small collection of charts. It needs:

- North Star metric.
- Activation rate.
- First Eve response rate.
- First durable content rate.
- Paid conversion.
- Retention.
- Current blocking issue.
- Data quality warnings.

The current executive dashboard is not ugly in the same way as the dense dashboard, but it is underpowered. It does not have enough explicit interpretation.

### 12. The Reliability Dashboard Is Separated But Also Duplicated

There is a dedicated `Reliability` dashboard, but `Dense Product Truth` also includes reliability failures. That is not inherently bad, but the relationship should be clear.

The top-level dashboard should show:

- Is reliability blocking activation right now?
- Exception rate.
- Eve response failure rate.
- Upload failure rate.
- Sync failure rate.
- Current open critical issue.

The dedicated reliability dashboard should then handle:

- Issue-level breakdown.
- Routes affected.
- Error messages.
- Regression timing.
- Recent deploy correlation.
- Owner and status.

Right now reliability appears both as a tile and a dashboard without a strong drilldown contract.

## What We Should Focus On

### Priority 1: Make One Real Operating Dashboard

Create one pinned "Start Here" dashboard. Everything else should be secondary.

Recommended name:

`4ever Prod - Operating Dashboard`

This dashboard should answer:

- Is acquisition healthy?
- Is activation healthy?
- Is Eve creating value?
- Are people creating durable family content?
- Is billing working?
- Is reliability blocking trust?
- Is the data trustworthy?

It should not contain every diagnostic chart. It should contain the metrics that tell you where to go next.

Recommended top-level sections:

- `Today / Last 24h`
- `Activation Funnel`
- `Eve Value Moment`
- `Monetization`
- `Durable Content`
- `Retention`
- `Reliability`
- `Instrumentation Health`

### Priority 2: Define The Real North Star

The dashboard needs a product-specific North Star. For 4ever, raw traffic is not enough. AI calls are not enough. Pageviews are not enough.

Possible North Star:

> Weekly users who create or meaningfully enrich durable family content after an Eve-assisted interaction.

If that is too advanced for current instrumentation, use a simpler interim metric:

> Users who complete onboarding, receive an Eve response, and create at least one durable content object.

The point is to connect activation to value, not just count visits.

### Priority 3: Build A Single Canonical Funnel

Use one canonical funnel as the spine:

1. `auth_completed`
2. `onboarding_intro_started`
3. `onboarding_intro_completed`
4. `eve_onboarding_started`
5. `eve_message_sent`
6. `eve_response_completed`
7. first durable content event
8. `billing_checkout_started`
9. `paid_conversion_confirmed`

The dashboard should show both:

- Unique users at each step.
- Step-to-step conversion.

This one funnel should be impossible to miss.

All the specialized funnels should become drilldowns:

- Adult branch.
- Time to paid.
- Time to first Eve message.
- Time to first Eve response.
- Profile photo behavior.
- Payment page behavior.

### Priority 4: Treat Eve As The Core Value Moment

The data suggests that getting users from Eve onboarding to first message and first completed response is a critical bottleneck.

The dashboard should separate Eve into a clear "value moment" section:

- Eve reached.
- First message sent.
- First response completed.
- Response failure rate.
- Median time to response.
- Follow-up message rate.
- User proceeds to content creation after Eve.

The current Eve charts exist, but they are scattered across dashboards and mixed with other onboarding diagnostics. Eve should be treated as one of the central product questions.

### Priority 5: Move Diagnostics Out Of The Main View

The main operating dashboard should not be where every diagnostic lives.

Move these into drilldowns:

- Photo skip reasons.
- Profile photo outcomes.
- Validation failures by step.
- Adult branch around children.
- Eve nav choices.
- Top app pages.
- Time-to-convert variants.

These are useful when a top-level metric says "there is a problem here." They are not useful as equal citizens on the default dashboard.

### Priority 6: Add Data Quality Warnings

The dashboard should explicitly flag when data cannot be trusted.

Examples:

- `paid_conversion_confirmed` has no events in the selected period.
- Web vitals coverage is below target.
- A critical event has not fired in 24 hours.
- Test accounts are included in a chart that should exclude them.
- A chart uses a hostname filter that may not match production.
- A funnel step has too few users to interpret.

This would make the dashboard more honest. It would also reduce the feeling that the numbers are arbitrary.

### Priority 7: Standardize Filters

Every production dashboard should use the same baseline filter policy:

- `deploymentEnvironment = production`
- test accounts excluded unless explicitly labeled otherwise
- host filtering standardized to the actual canonical host values
- date windows standardized by dashboard purpose
- all key activation and billing events required to include expected properties

The AI generation chart currently appears to include test accounts while most other charts exclude them. That should be fixed or loudly labeled.

### Priority 8: Make It Visually Legible

The visual rebuild should be simple:

- Put 5 to 8 KPI cards at the top.
- Use one large canonical funnel below them.
- Use section headers.
- Use compact diagnostic tables only where they answer a specific question.
- Use red/yellow/green threshold labels.
- Use one chart type per question, not one chart per idea.
- Give critical metrics more space.
- Reduce tile count on the main dashboard to roughly 8 to 10 tiles.

The dashboard should look like a control room, not a file cabinet.

## Proposed Dashboard Architecture

### 1. `4ever Prod - Operating Dashboard`

Purpose: the one dashboard to open first.

Tiles:

- KPI cards: visitors, auth completed, onboarding completion rate, first Eve response rate, first durable content users, checkout starts, paid conversions, critical reliability warnings.
- Canonical activation funnel.
- Eve value moment funnel.
- Durable content creation trend.
- Monetization funnel.
- Retention summary.
- Reliability status.
- Instrumentation health warnings.

### 2. `4ever Prod - Activation Diagnostics`

Purpose: explain onboarding dropoff.

Tiles:

- Common onboarding path.
- Time to complete intro.
- Step-level dropoff.
- Validation failures by step.
- Profile photo completion vs skip.
- Photo skip reasons.
- Adult branch / children step.

### 3. `4ever Prod - Eve / AI Diagnostics`

Purpose: explain Eve usage and AI quality.

Tiles:

- Eve reached to first message.
- First message to first completed response.
- Response failures.
- Response latency.
- Follow-up message rate.
- AI generation volume.
- AI cost or token usage if available.
- User proceeds to durable content after Eve.

### 4. `4ever Prod - Reliability`

Purpose: engineering triage.

Tiles:

- Exceptions over time.
- Distinct exception issues.
- Eve failures.
- Upload failures.
- Sync failures.
- Top affected routes.
- Recent deploy correlation.
- Web vitals coverage and slow routes.

### 5. `4ever Prod - Acquisition / Landing`

Purpose: marketing and signup diagnostics.

Tiles:

- Landing visitors.
- Source / campaign breakdown.
- Landing to auth funnel.
- Landing page performance.
- Signup conversion.

All other old dashboards should be unpinned or archived once replacements exist.

## What To Remove Or De-emphasize

De-emphasize:

- Generic DAU/WAU/MAU as top-level truth.
- Top pages as a primary metric.
- AI generation count without success, quality, cost, or downstream activation.
- Multiple nearly identical time-to-convert funnel variants on the same dashboard.
- Any chart that has no clear action attached.

Remove from the main dashboard:

- Profile photo skip reasons.
- Eve nav choices.
- Validation failures by step.
- Adult branch around children.
- Top app pages.
- Raw event coverage table unless it is converted into a clear health warning block.

Keep these as drilldowns, not headline metrics.

## What To Add

Add:

- Activation rate from auth to onboarding completed.
- Eve value rate from onboarding completed to first completed Eve response.
- Durable content activation rate.
- Paid conversion rate.
- Checkout start to paid conversion rate.
- First-session completion rate.
- Week 1 return rate for activated users.
- Eve response failure rate.
- Upload failure rate.
- Web vitals coverage rate.
- Data quality warning count.

Also add a "current diagnosis" note at the top of the dashboard. It can be manually updated at first:

> Current read: onboarding starts are happening, but very few users are sending Eve messages or creating durable content. Focus this week on Eve prompt clarity, first-message motivation, response reliability, and the path from Eve to saved content.

This kind of note does more for decision-making than another chart.

## The Real Product Questions

The dashboard should be organized around questions, not data availability.

The important questions are:

- Are the right people arriving?
- Do they understand what to do?
- Do they finish onboarding?
- Do they reach Eve?
- Do they send Eve a meaningful first message?
- Does Eve respond successfully and quickly?
- Does that response cause the user to preserve something meaningful?
- Do they pay?
- Do they return?
- Are any reliability issues blocking trust?
- Can we trust the data?

Every tile should map to one of those questions. If it does not, it should not be on the main dashboard.

## Why The Current Dashboard Is Misleading

The current dashboard can make the product feel more measurable than it actually is.

Examples:

- If `paid_conversion_confirmed` is absent, a paid funnel may look like a product failure, a payment failure, or an instrumentation failure. The dashboard does not force that distinction.
- If web vitals coverage is 27.7%, performance charts may look clean while coverage is too thin to trust.
- If AI generation count includes test accounts, the chart may overstate real user engagement.
- If host filters are inconsistent, traffic and funnel charts may disagree for technical reasons.
- If 30-day windows dominate, a fresh regression can be hidden.

This is why you leave the dashboard uncertain. The charts are not lying, but the system is not telling you how much to trust them.

## Recommended Rebuild Plan

### Phase 1: Clean Up Navigation

- Pick one pinned starting dashboard.
- Unpin old `App metrics` and `Landing page metrics` unless they are actively used.
- Rename dashboards based on operational role, not broad topic.
- Add descriptions that tell the user when to use each dashboard.

### Phase 2: Build The Operating Dashboard

- Add top KPI cards.
- Add one canonical activation funnel.
- Add Eve value section.
- Add durable content section.
- Add monetization section.
- Add reliability and data quality warnings.
- Keep the dashboard to roughly 8 to 10 high-signal tiles.

### Phase 3: Move Diagnostics Into Drilldowns

- Move adult branch, photo, validation, and nav-choice charts into activation diagnostics.
- Move AI generation, latency, failures, and message-depth charts into Eve diagnostics.
- Move exceptions, uploads, sync, and web vitals into reliability diagnostics.

### Phase 4: Standardize Metrics

- Define canonical event names.
- Define required event properties.
- Standardize production filtering.
- Standardize test account filtering.
- Standardize host filtering.
- Define default time windows.
- Add thresholds.

### Phase 5: Add Alerting And Ownership

- Add alerts for missing critical events.
- Add alerts for conversion drops.
- Add alerts for Eve failure rate.
- Add alerts for upload failure rate.
- Add alerts for web vitals coverage.
- Assign metric owners.

## What "Good" Should Look Like

A good version of this dashboard should let you answer the following in under one minute:

- Traffic is up/down vs baseline.
- Onboarding completion is healthy/unhealthy.
- Eve first-response activation is healthy/unhealthy.
- Durable content creation is healthy/unhealthy.
- Paid conversion is healthy/unhealthy.
- Reliability is blocking/not blocking users.
- Data quality is trustworthy/not trustworthy.
- The next dashboard to open is obvious.

If it takes more than one minute to answer those questions, the dashboard is still too messy.

## Bottom Line

The dashboard is bad because it confuses completeness with clarity.

It has many useful ingredients, but they are arranged in a way that makes the user do too much interpretation. The most important product story is buried under duplicated funnels, equal-weight tiles, long chart names, inconsistent filters, and diagnostic details that should live one click deeper.

The team should focus on a smaller operating dashboard centered on activation to Eve, first successful Eve response, durable content creation, monetization, reliability, and data quality. Everything else should become a drilldown.

The current dashboard tells you that data exists. The next dashboard needs to tell you what to do.
