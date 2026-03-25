# PostHog Insights Skill

Query insights, trends, and analytics from PostHog.

## Triggers
- User asks about metrics, trends, or analytics
- User wants to see dashboard data
- User mentions "insight", "trend", "metric", "analytics"
- User wants to compare current vs historical data

## Tools Available

### posthog_query
Run HogQL queries for insights.

**Example:**
```sql
SELECT count() FROM events WHERE event = '$pageview' 
  AND timestamp >= now() - interval 7 DAY
GROUP BY toDate(timestamp)
```

### posthog_list_insights
List available insights in the project.

## Usage Patterns

1. **Trend analysis**: Compare current period to previous
2. **Metric breakdown**: Group by properties
3. **Funnel analysis**: Query funnel data
4. **Retention**: Query retention cohorts

## Important Notes
- Use configured insight monitors as starting points
- Flag any regressions (current vs baseline) as findings
