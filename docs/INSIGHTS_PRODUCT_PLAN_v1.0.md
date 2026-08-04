# Insights Product Plan v1.0

## Product position

Insights is a question-first golf intelligence workspace, not a collection of charts. It should answer what costs a golfer strokes, where performance is changing, which courses and holes expose strengths or weaknesses, and what to focus on next. Deterministic analysis leads; AI explains supported facts and never calculates or invents them.

## Experience

- My Game: current form, strengths, opportunities, and data coverage.
- Scoring Trends: gross, net, to-par, conversion, and avoidance trends.
- Hole Performance: course, hole, par, yardage band, side, and repeat-hole history.
- Approach & Short Game: fairway-conditioned GIR, GIR, fairways, putts, Up & Downs, Sandies, and penalties where tracked.
- Games & Competition: descriptive performance by game, partner, opponent, and competitive context.
- Compare: two saved filter cohorts side by side.
- AI Coach: guided questions, evidence-backed observations, and a measurable Next Round Plan.

Filters include golfer, dates, last-N rounds, course, tee, hole, par, yardage, side, completion state, stat coverage, games, partners/opponents, and recorded weather. Active filters appear as removable chips with eligible round/hole counts. Saved Views remain local first.

## Architecture and trust

- Query authoritative current RoundRecord versions through versioned `InsightFilterSpec` and `InsightResult` contracts.
- Preserve source Round/version IDs, numerator, denominator, eligibility, data-quality flags, and calculation version.
- Aggregate successes and opportunities; never average round percentages.
- Missing means not recorded, never false or zero.
- Keep derived caches disposable and non-authoritative.
- Never merge Golfer Identities by name, email, phone, or GHIN.
- Deterministic filters and drill-down work offline. AI is explicit, retryable, non-blocking, and receives the minimum aggregated evidence required.

## Sample-size language

- One round is descriptive, not a trend.
- Fewer than 3 rounds or 18 eligible holes: Limited sample.
- 3–4 rounds or 18–44 eligible holes: Early signal.
- 5+ rounds and 45+ eligible holes: Established pattern, not certainty.
- Comparison deltas generally require at least 10 opportunities per cohort.
- AI recommendations require at least 5 rounds, 36 tracked holes overall, and 10 eligible opportunities for the cited split.

Every result shows its numerator, denominator, eligible sample, and a drill-down to contributing rounds or holes. AI claims cite those same facts and avoid causal or swing-mechanics conclusions.

## Staged releases

1. Insights Foundation: contracts, legacy adapter, eligibility rules, calculation fixtures, and coverage audit.
2. Insights Core: offline overview, filters, Saved Views, trends, hole performance, and cohort comparison.
3. Tracked Performance: approach, short-game, and putting slices after per-hole immutable stat provenance is complete.
4. AI Coach: evidence packages, guided questions, recommendations, contradiction gates, and separately approved server deployment.
5. Competition & Advanced: games, partners/opponents, competitive context, and Next Round Plans.

