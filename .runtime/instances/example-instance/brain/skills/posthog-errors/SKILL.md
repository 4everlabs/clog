# PostHog Errors Skill

Query and analyze errors from your PostHog project.

## Triggers
- User asks about errors
- User wants to see recent errors
- User mentions "exception", "crash", "error rate"
- User wants to investigate a specific error

## Tools Available

### posthog_query
Run raw HogQL queries against PostHog.

**Example:**
```sql
SELECT * FROM events WHERE event = '$exception' ORDER BY timestamp DESC LIMIT 100
```

## Usage Patterns

1. **Error spike detection**: Query for error counts in current vs previous window
2. **Root cause analysis**: Query error details including stack traces
3. **Error trends**: Query aggregated errors over time

## Important Notes
- Always cite the actual data in responses
- If error rates spike, surface this immediately as a finding
