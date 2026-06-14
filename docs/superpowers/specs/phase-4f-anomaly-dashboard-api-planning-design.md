# Phase 4F Anomaly Dashboard/API Planning Design

## Objective

Define the future read-side integration for persisted anomalies and evidence links before implementing dashboard wiring or API routes.

The design should document:

- RLS-safe Supabase read boundaries.
- Dashboard/API data contracts.
- Query patterns for project feeds, run panels, and anomaly detail drawers.
- Realtime subscription scope.
- Evidence drill-down behavior.
- Tests required before implementation.

This phase remains planning only. It does not add API routes, React data fetching, Supabase clients, migrations, LLM calls, Terraform execution, Checkov execution, artifact downloads, or cloud commands.

## Recommended Approach

Use direct authenticated Supabase reads first, with RLS as the authorization guard and explicit `organization_id` plus run/project filters for predictable query behavior.

Avoid a service-role read path for normal dashboard views. Service-role clients should remain limited to trusted ingestion and persistence jobs.

## Read Model

The first read surfaces should be:

- Project anomaly feed for recent deployment runs.
- Deployment run anomaly panel.
- Anomaly detail drawer with linked evidence summaries.

Evidence source resolution should use an allowlist:

- `deployment_runs`
- `terraform_plans`
- `terraform_resource_changes`
- `iac_scan_findings`

Unsupported source tables should be treated as invalid for dashboard evidence resolution.

## Realtime

Realtime should wait until dashboard data wiring begins. When implemented, subscribe only to selected tables and filtered row scopes, then refetch the affected list/detail query after an event.

## Documentation Target

The canonical Phase 4F planning document is `docs/ANOMALY_DASHBOARD_API_PLAN.md`.

Project status docs should link to that document and make clear that no runtime dashboard/API integration exists yet.
