# Anomaly Dashboard And API Read Plan

## Scope

Phase 4F defines how future dashboard and API work should read persisted deterministic anomalies and supporting evidence links from Supabase.

This phase is planning only. It does not add API routes, React data wiring, Supabase clients, Realtime subscriptions, migrations, LLM calls, Terraform execution, Checkov execution, artifact downloads, or cloud commands.

## Current Inputs

The read model starts from data already prepared by earlier phases:

- `deployment_runs` rows scoped to an organization and project.
- `terraform_plans`, `terraform_resource_changes`, and `iac_scan_findings` rows created by parser persistence.
- `anomalies` rows created by anomaly persistence.
- `evidence_links` rows where source evidence records support target anomaly records.

Anomaly evidence sources are currently limited to:

- `deployment_runs`
- `terraform_plans`
- `terraform_resource_changes`
- `iac_scan_findings`

The future dashboard should treat this allowlist as a contract. It should not dynamically query arbitrary table names from `evidence_links`.

## Read Surfaces

Future dashboard/API integration should support three read surfaces:

- Project anomaly feed: latest anomalies across deployment runs for one project.
- Deployment run anomaly panel: anomalies for one deployment run.
- Anomaly detail drawer: one anomaly plus the evidence records linked to it.

The first implementation should prefer simple authenticated Supabase reads over custom RPCs. Add server routes or RPCs only when the query shape becomes hard to secure, type, or optimize through direct table reads.

## RLS-Safe Boundary

Dashboard reads must use an authenticated user context:

- Browser reads should use the public Supabase client with the user's session.
- Next.js server component or route reads should use an SSR authenticated client created from the user's cookies.
- Normal dashboard reads should not use the service-role key.
- Service-role clients remain reserved for trusted ingestion, parser persistence, anomaly persistence, and future background jobs.

Every read must include explicit scope filters:

- `organization_id`
- `deployment_run_id` for run detail views
- project-derived run IDs for project feeds

RLS remains the final authorization guard. Existing member read policies on `deployment_runs`, `anomalies`, and `evidence_links` allow organization members to read scoped rows and block cross-tenant reads. The application should still pass the scope filters so queries are predictable and use indexes.

For future tables or views exposed through the Supabase Data API, migrations must add explicit `grant select ... to authenticated` statements alongside RLS policies. Supabase's newer default behavior separates table grants from RLS, so both layers must be deliberate.

No anonymous anomaly or evidence reads should be added for the MVP.

## Data Contracts

Future API or query helper code should return compact dashboard DTOs. These shapes are documentation contracts only in Phase 4F.

```ts
export type AnomalyDashboardSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface AnomalyListItem {
  id: string;
  organizationId: string;
  deploymentRunId: string;
  severity: AnomalyDashboardSeverity;
  category: string | null;
  title: string;
  summary: string;
  detectedAt: string;
  anomalyEngineVersion: string;
  fingerprint: string | null;
  evidenceCount: number;
}

export interface AnomalyEvidenceLinkItem {
  id: string;
  organizationId: string;
  deploymentRunId: string | null;
  sourceTable:
    | "deployment_runs"
    | "terraform_plans"
    | "terraform_resource_changes"
    | "iac_scan_findings";
  sourceId: string;
  targetTable: "anomalies";
  targetId: string;
  label: "supports_anomaly" | string;
  metadata: Record<string, unknown>;
}

export interface AnomalyEvidenceDetail {
  link: AnomalyEvidenceLinkItem;
  source:
    | DeploymentRunEvidenceSummary
    | TerraformPlanEvidenceSummary
    | TerraformResourceChangeEvidenceSummary
    | IacScanFindingEvidenceSummary
    | null;
}

export interface AnomalyDetail {
  anomaly: AnomalyListItem;
  evidence: AnomalyEvidenceDetail[];
}
```

Evidence summary DTOs should include only display-safe fields such as resource address, action list, risk flags, Checkov check ID, scanner status, severity, file path, run status, commit SHA, and workflow URL. They should not include raw Terraform JSON, full Checkov payloads, logs, secrets, service-role values, LLM prompts, or LLM raw responses.

## Query Plan

### Deployment Run Panel

Read anomalies for one deployment run:

```ts
supabase
  .from("anomalies")
  .select(
    "id, organization_id, deployment_run_id, severity, category, title, summary, detected_at, anomaly_engine_version, fingerprint",
  )
  .eq("organization_id", organizationId)
  .eq("deployment_run_id", deploymentRunId)
  .order("detected_at", { ascending: false })
  .order("id", { ascending: false });
```

Then read supporting evidence links:

```ts
supabase
  .from("evidence_links")
  .select(
    "id, organization_id, deployment_run_id, source_table, source_id, target_table, target_id, label, metadata",
  )
  .eq("organization_id", organizationId)
  .eq("deployment_run_id", deploymentRunId)
  .eq("target_table", "anomalies")
  .in("target_id", anomalyIds);
```

Resolve source rows with one allowlisted query per source table. Do not build dynamic table names from user input or from untrusted link metadata.

### Project Feed

Read recent deployment runs for the selected project, then read anomalies for those run IDs:

```ts
supabase
  .from("deployment_runs")
  .select(
    "id, organization_id, project_id, environment, status, started_at, completed_at",
  )
  .eq("organization_id", organizationId)
  .eq("project_id", projectId)
  .order("started_at", { ascending: false })
  .limit(50);
```

```ts
supabase
  .from("anomalies")
  .select(
    "id, organization_id, deployment_run_id, severity, category, title, summary, detected_at, anomaly_engine_version, fingerprint",
  )
  .eq("organization_id", organizationId)
  .in("deployment_run_id", deploymentRunIds)
  .order("detected_at", { ascending: false })
  .limit(100);
```

The first dashboard slice can aggregate counts client-side from the returned page. If project feeds grow beyond this shape, add a reviewed server-side read model or view with explicit grants, RLS, and indexes.

### Anomaly Detail

Read exactly one anomaly by organization and ID, then read links where `target_table = "anomalies"` and `target_id = anomaly.id`. If the anomaly row is not visible through RLS, return a not-found response rather than leaking whether another tenant has that ID.

## Filters

The future dashboard should support these filters in order:

- Project and environment.
- Deployment run.
- Severity.
- Category.
- Deployment status.
- Time range.

Recommended query behavior:

- Run detail views always filter by `deployment_run_id`.
- Project feeds filter by `project_id` through `deployment_runs`, then read anomalies for the selected run IDs.
- Severity and category filters apply to `anomalies`.
- Environment and status filters apply to `deployment_runs`.
- Time range filters use deployment run timestamps for project feeds and `detected_at` for anomaly-only views.

Existing indexes support run-scoped anomaly views well. Before implementing broad project feeds, consider adding composite indexes for the exact query patterns, such as:

```sql
create index if not exists deployment_runs_org_project_started_idx
on public.deployment_runs (organization_id, project_id, started_at desc);

create index if not exists anomalies_org_detected_idx
on public.anomalies (organization_id, detected_at desc);
```

Do not add these indexes until the dashboard query shape is implemented and verified.

## Evidence Drill-Down Behavior

Evidence drill-down should be evidence-first and compact:

1. Render an anomaly list item with severity, category, title, summary, detected time, and evidence count.
2. On detail open, fetch evidence links for that anomaly.
3. Group evidence links by `source_table`.
4. Fetch source summaries through allowlisted table-specific queries.
5. Display missing or no-longer-visible source records as unavailable evidence.

The UI should make evidence traceability clear without exposing raw payloads by default. Raw fixture paths, full logs, scanner payloads, and Terraform JSON should stay behind later explicit evidence-viewer work with redaction.

## Realtime Plan

Realtime should be added only when the dashboard starts reading live Supabase data.

Future migration work should add only the tables that need live dashboard updates to the `supabase_realtime` publication. Start with:

- `public.deployment_runs`
- `public.anomalies`
- `public.evidence_links`

Use narrow subscriptions:

- Run detail: subscribe to `anomalies` and `evidence_links` with `deployment_run_id=eq.<runId>`.
- Project dashboard: subscribe to `deployment_runs` with `project_id=eq.<projectId>` and either subscribe to selected run-level anomaly channels or an organization-scoped anomaly channel with client-side project filtering from the loaded run map.

Postgres Changes sends rows only to clients allowed to read them by RLS. The app should still use filters to reduce noise and avoid subscribing to all public schema changes.

On Realtime events, prefer refetching the affected anomaly list or detail query instead of trusting the event payload as the complete evidence graph. This keeps derived evidence counts and source summaries consistent.

JWT refresh handling must be part of the future implementation. If the user loses authorization or the channel disconnects, the dashboard should stop showing live status and ask the user to refresh or sign in again.

## Test Plan

Future implementation should include:

- Contract tests for `AnomalyListItem`, `AnomalyDetail`, and evidence summary mapping.
- Query-builder unit tests that assert every anomaly/evidence read includes `organization_id` and either `deployment_run_id` or project-derived run IDs.
- Allowlist tests proving evidence source resolution rejects unsupported `source_table` values.
- RLS integration tests with local Supabase showing a member can read their own organization's anomalies and evidence links, cannot read another organization's rows, and anonymous users cannot read dashboard data.
- Viewer/member tests confirming read-only roles can read dashboard data but cannot write anomalies or evidence links.
- Realtime planning tests or manual verification that only selected tables are added to the publication and subscriptions use table/filter-specific channels.
- Regression tests for missing evidence rows so the detail view can degrade gracefully.

Do not add LLM tests, Terraform execution tests, Checkov execution tests, or cloud integration tests for this read-model phase.

## Definition Of Done For Future Implementation

The future dashboard/API implementation is done when:

- Dashboard anomaly reads use authenticated RLS-protected Supabase queries.
- Service-role credentials are not used in browser code or normal dashboard reads.
- The anomaly list and detail contracts are typed and tested.
- Evidence drill-down resolves only allowlisted source tables.
- Realtime subscriptions are scoped and verified against RLS behavior.
- Tests cover tenant isolation, missing evidence, and read-only roles.
- No UI path executes Terraform, Checkov, LLM calls, or infrastructure commands.
