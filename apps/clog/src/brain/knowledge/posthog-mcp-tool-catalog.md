# PostHog MCP Tool Catalog

Verified against official PostHog docs on 2026-04-01.

Sources:
- https://posthog.com/docs/model-context-protocol
- https://posthog.com/

## What the docs say matters most

The PostHog MCP server is much broader than the small subset currently surfaced in `clog`.

Important documented capabilities:
- Workspace context management for organizations and projects
- Analytics insights and query execution
- Dashboard CRUD and tile management
- Feature flag management and scheduled changes
- Experiments and experiment result retrieval
- Error tracking and issue updates
- Logs search and log attribute discovery
- SQL execution and schema exploration
- Persons, cohorts, alerts, annotations, surveys, notebooks, prompts, and workflows
- Data warehouse saved queries and materialization
- Hog functions and templates
- Docs search and global entity search

## Best build order for `clog`

### 1. Operator triage

Build these first:
- `workspace`
- `insights`
- `dashboards`
- `error_tracking`
- `logs`
- `alerts`
- `search`
- `docs`

Why:
- This is the shortest path to a production-grade monitoring copilot.
- It lets the model move from "something looks off" to "here is the dashboard, error issue, log slice, and alert context."

### 2. Release safety

Build these second:
- `flags`
- `experiments`
- `annotations`
- `cohorts`
- `persons`

Why:
- These let the model reason about rollout state, blast radius, and rollback options.
- They connect monitoring directly to release operations instead of only reporting.

### 3. Data and growth

Build these third:
- `data_schema`
- `sql`
- `data_warehouse`
- `surveys`
- `llm_analytics`

Why:
- These are high leverage, but they become much more useful once the core monitoring and release loop is already solid.

### 4. Automation and long-tail surfaces

Build these last:
- `hog_functions`
- `actions`
- `workflows`
- `reverse_proxy`
- `early_access_features`
- `notebooks`

Why:
- These are useful, but they are not the first thing that makes `clog` feel materially better during incidents or launches.

## Most helpful documented tool families

### Insights and dashboards

Key tools:
- `query-run`
- `insight-query`
- `insights-get-all`
- `dashboard-get`
- `dashboards-get-all`

Use these for:
- health snapshots
- conversion checks
- retention checks
- path analysis
- saved dashboard retrieval

### Error tracking and logs

Key tools:
- `error-tracking-issues-list`
- `error-details`
- `list-errors`
- `logs-query`
- `logs-list-attributes`

Use these for:
- active incident triage
- root-cause narrowing
- validating whether a deploy introduced a production error

### Flags and experiments

Key tools:
- `feature-flag-get-all`
- `feature-flags-status-retrieve`
- `feature-flags-user-blast-radius-create`
- `experiment-get-all`
- `experiment-results-get`

Use these for:
- rollout state
- blast radius estimation
- experiment monitoring
- release gating

### Data exploration

Key tools:
- `read-data-schema`
- `read-data-warehouse-schema`
- `execute-sql`
- `query-generate-hogql-from-question`

Use these for:
- asking better questions
- building dashboards faster
- discovering missing instrumentation

## MCP setup details that matter

Server URLs:
- US: `https://mcp.posthog.com/mcp`
- EU: `https://mcp-eu.posthog.com/mcp`

Pinning headers:
- `x-posthog-organization-id`
- `x-posthog-project-id`

Feature filtering example:
- `https://mcp.posthog.com/mcp?features=flags,experiments,insights`

If you pin to a project, the docs say `switch-organization` and `switch-project` are removed from the tool list automatically.

## Recommendation for `clog`

The current `clog` surface should stop thinking about PostHog as only:
- queries
- errors
- endpoint CLI

It should think about PostHog as four surfaces:
- investigation
- release safety
- analytics buildout
- automation

The new documented tool catalog endpoint and tool are meant to be the source of truth for that broader surface.
