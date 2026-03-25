# Vercel Logs Skill

Query deployment and function logs from Vercel.

## Triggers
- User asks about deployment logs
- User mentions "vercel", "deployment", "logs"
- User wants to investigate a specific deployment

## Tools Available

### vercel_get_logs
Fetch logs from Vercel deployments.

**Parameters:**
- `deployment_id`: The deployment to query
- `function_name`: Optional function name
- `limit`: Max logs to return

## Usage Patterns

1. **Debug failures**: Get logs for failed deployments
2. **Performance issues**: Check function execution times
3. **Recent activity**: List recent deployments

## Important Notes
- Focus on error-level logs
- Flag failed deployments as findings
