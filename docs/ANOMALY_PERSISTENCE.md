# Anomaly Persistence Plan

## Scope

Phase 4B defines how deterministic `Anomaly` objects from Phase 4A should be written to Supabase in a future implementation phase.

Current work is planning only. It does not add migrations, row builders, Supabase writes, API routes, webhook workers, LLM calls, Terraform execution, Checkov execution, artifact download, or cloud commands.

## Current Inputs

The future anomaly persistence layer will start from data ADIA already has:

- One validated `deployment_runs` row.
- Persisted Terraform parser output in `terraform_plans` and `terraform_resource_changes`.
- Persisted Checkov parser output in `iac_scan_findings`.
- In-memory `Anomaly[]` values from `packages/analyzers`.

Phase 4A anomalies include:

- `organizationId`
- `deploymentRunId`
- `severity`
- `category`
- `title`
- `summary`
- `evidenceRefs`
- `detectedAt`

The analyzer remains persistence-free. It generates deterministic findings only. Future persistence belongs in server-only package code.

## Schema Readiness

The Phase 1 schema already includes `public.anomalies` with organization/run scope, severity, category, title, summary, and `detected_at`. It also enables RLS and uses an organization/run consistency trigger.

The Phase 3D migration already makes `evidence_links` duplicate-safe with a unique index on:

```text
organization_id, source_table, source_id, target_table, target_id, label
```

Future anomaly persistence should add a migration before writes are implemented:

```sql
alter table public.anomalies
add column if not exists anomaly_engine_version text not null default 'legacy',
add column if not exists fingerprint text,
add column if not exists evidence_refs text[] not null default '{}'::text[],
add column if not exists metadata jsonb not null default '{}'::jsonb;
```

Recommended constraints and indexes:

```sql
alter table public.anomalies
add constraint anomalies_engine_version_present
check (length(btrim(anomaly_engine_version)) > 0);

alter table public.anomalies
add constraint anomalies_fingerprint_format
check (fingerprint is null or fingerprint ~ '^[a-f0-9]{64}$');

create unique index anomalies_run_engine_fingerprint_unique_idx
on public.anomalies (deployment_run_id, anomaly_engine_version, fingerprint);

create index anomalies_run_category_idx
on public.anomalies (deployment_run_id, category);

create index anomalies_run_severity_idx
on public.anomalies (deployment_run_id, severity);
```

If future work creates new public tables or changes role exposure, the migration should include explicit `GRANT` statements alongside RLS policy changes. Supabase now treats table grants and RLS as separate access layers for Data API visibility.

## Future Server Boundary

Anomaly persistence should live in `packages/ingestion` or another server-only package, not in `packages/analyzers` and not in browser code.

Future API shape:

```ts
persistAnomaliesForRun(client, {
  organizationId,
  deploymentRunId,
  anomalyEngineVersion: "anomaly-engine-v1",
  anomalies,
});
```

The function should:

1. Resolve the `deployment_runs` row by `organizationId` and `deploymentRunId`.
2. Validate every anomaly matches that organization and run.
3. Parse each `evidenceRefs` value into `{ sourceTable, sourceId }`.
4. Resolve every evidence source from Supabase.
5. Verify every evidence source belongs to the same organization.
6. For run-scoped source tables, verify the same deployment run when the table has `deployment_run_id`.
7. Build anomaly write rows with deterministic fingerprints.
8. Upsert anomalies.
9. Upsert evidence links from source evidence records to anomaly rows.
10. Return persisted anomaly IDs, fingerprints, and evidence-link counts.

Browser code must never call this function directly and must never receive service-role credentials.

## Evidence Reference Mapping

Phase 4A emits evidence refs as strings:

```text
deployment_runs:<id>
terraform_plans:<id>
terraform_resource_changes:<id>
iac_scan_findings:<id>
```

Future persistence should parse only this allowlisted format:

```ts
type ParsedAnomalyEvidenceRef = {
  sourceTable:
    | "deployment_runs"
    | "terraform_plans"
    | "terraform_resource_changes"
    | "iac_scan_findings";
  sourceId: string;
};
```

Invalid evidence refs should fail closed. Do not silently persist an anomaly whose evidence cannot be resolved unless a future phase intentionally adds a degraded `unresolved_evidence` status.

Recommended evidence links:

- `deployment_runs` -> `anomalies` with label `supports_anomaly`
- `terraform_plans` -> `anomalies` with label `supports_anomaly`
- `terraform_resource_changes` -> `anomalies` with label `supports_anomaly`
- `iac_scan_findings` -> `anomalies` with label `supports_anomaly`

Recommended metadata:

```json
{
  "anomalyCategory": "terraform_public_exposure",
  "anomalyEngineVersion": "anomaly-engine-v1",
  "evidenceRef": "terraform_resource_changes:<id>"
}
```

Evidence-link metadata should stay compact. It should not store raw Terraform plans, full logs, scanner payloads, secrets, or LLM output.

## Idempotency Plan

Anomaly persistence must be replay-safe. Re-running the same deterministic anomaly engine for the same deployment run should update the same anomaly rows and not duplicate evidence links.

Recommended anomaly fingerprint:

```text
sha256(stable_json({
  kind: "anomaly",
  anomalyEngineVersion,
  deploymentRunId,
  category,
  severity,
  title,
  evidenceRefs: sortedUniqueEvidenceRefs
}))
```

Do not include `summary` or `detectedAt` in the fingerprint. That lets wording improve or timestamps normalize without creating a new logical anomaly.

Future upsert conflict target:

```text
deployment_run_id, anomaly_engine_version, fingerprint
```

Future replay behavior:

- Same anomaly and same evidence refs: update title, summary, severity, category, detected_at, metadata, and evidence_refs in place.
- Same anomaly with changed wording: update the existing row.
- Same category with changed evidence refs: create a distinct row because the evidence changed.
- Previously persisted anomaly missing from a later replay: leave it untouched in the first implementation. A later lifecycle phase can add `stale_at`, `resolved_at`, or `status`.
- Evidence links: upsert by the existing `evidence_links_unique_idx` key and do not delete missing links until lifecycle semantics exist.

## RLS-Safe Access Model

Future anomaly persistence can safely run in two modes:

- Trusted server job mode: use a service-role client only in server code, then explicitly verify organization, deployment run, anomaly, and evidence-source ownership before writes.
- User-initiated admin mode: use an authenticated Supabase client for an owner or admin. Existing RLS policies allow owner/admin inserts and updates for `anomalies` and `evidence_links`.

The dashboard should read persisted anomalies through normal RLS-protected queries only. Members and viewers can read organization-scoped anomalies, while writes stay server/admin-only.

Do not add a `security definer` anomaly persistence function in an exposed schema. If a future RPC is needed for transactionality, prefer a carefully reviewed `security invoker` function or a server-side direct Postgres transaction.

## Transaction And Consistency Plan

The ideal future implementation writes anomaly rows and evidence links in one transaction.

Options:

- Direct Postgres transaction from trusted server code if ADIA adds a Postgres driver.
- Supabase RPC using `security invoker`, explicit organization checks, and normal RLS.
- Ordered idempotent upserts as the first implementation, with retry safety and no destructive deletes.

Existing database guards already help:

- `anomalies_run_org_guard` rejects anomaly rows whose deployment run belongs to another organization.
- `evidence_links_run_org_guard` checks link organization/run consistency.
- `evidence_record_belongs_to_org` validates that linked source and target records exist in the same organization.

Future application code should still validate these relationships before writes so errors are clear and testable before database triggers reject invalid rows.

## Test Plan

Future anomaly persistence should be test-driven and include:

- Unit tests for `evidenceRefs` parsing, including invalid table names, invalid IDs, missing separators, duplicate refs, and unsupported tables.
- Unit tests for anomaly row builders that verify snake_case columns, deterministic fingerprints, metadata shape, `evidence_refs`, and scope validation.
- Unit tests for evidence link row builders that map each supported evidence table to `anomalies` with label `supports_anomaly`.
- Idempotency tests that persist the same anomalies twice and verify stable anomaly rows plus duplicate-free evidence links.
- Replay tests where anomaly wording changes but evidence refs stay the same, verifying an update instead of a duplicate.
- Evidence-change tests where evidence refs change, verifying a new fingerprint.
- Tenant safety tests that reject mismatched anomaly organization/run IDs.
- Evidence ownership tests that reject evidence refs from another organization or another run.
- Failure tests for missing deployment run, missing evidence source, anomaly upsert failure, and evidence-link upsert failure.
- Static safety tests or review checks confirming the persistence module does not call LLMs, execute Terraform, execute Checkov, spawn shell commands, read cloud credentials, or expose service-role keys to browser code.

Property-based tests can generate anomaly arrays with duplicate and shuffled evidence refs, then assert stable fingerprints and duplicate-free evidence links.

## Implementation Readiness Checklist

Before implementing anomaly persistence, ADIA should add:

- A migration for `anomaly_engine_version`, `fingerprint`, `evidence_refs`, metadata, constraints, and indexes.
- Row builders in server-only package code.
- A persistence orchestration function similar to parser persistence.
- Tests for mapping, idempotency, tenant safety, evidence ownership, and failure cases.
- Docs updates stating that anomalies are now persisted.

Until then, Phase 4A anomalies remain in memory only.
