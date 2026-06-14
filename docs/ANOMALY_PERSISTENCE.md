# Anomaly Persistence Readiness

## Scope

Phase 4B defines how deterministic `Anomaly` objects from Phase 4A should be written to Supabase. Phase 4C implements the schema readiness and pure row builders required before those writes are orchestrated. Phase 4D adds the server-side orchestration for validated fixture/parser data. Phase 4E invokes that orchestration from local parsed-fixture replay after parser persistence succeeds.

Current work does not add API routes, webhook workers, LLM calls, Terraform execution, Checkov execution, artifact download, dashboard wiring, or cloud commands.

## Current Inputs

The anomaly persistence layer starts from data ADIA already has:

- One validated `deployment_runs` row.
- Persisted Terraform parser output in `terraform_plans` and `terraform_resource_changes`.
- Persisted Checkov parser output in `iac_scan_findings`.
- Deterministic `Anomaly[]` values from `packages/analyzers`.

Phase 4A anomalies include:

- `organizationId`
- `deploymentRunId`
- `severity`
- `category`
- `title`
- `summary`
- `evidenceRefs`
- `detectedAt`

The analyzer remains persistence-free. It generates deterministic findings only. Persistence belongs in server-only package code.

## Schema Readiness

The Phase 1 schema already includes `public.anomalies` with organization/run scope, severity, category, title, summary, and `detected_at`. It also enables RLS and uses an organization/run consistency trigger.

The Phase 3D migration already makes `evidence_links` duplicate-safe with a unique index on:

```text
organization_id, source_table, source_id, target_table, target_id, label
```

Phase 4C adds the anomaly migration before writes are implemented:

```sql
alter table public.anomalies
add column if not exists anomaly_engine_version text not null default 'legacy',
add column if not exists fingerprint text,
add column if not exists evidence_refs text[] not null default '{}'::text[],
add column if not exists metadata jsonb not null default '{}'::jsonb;
```

Implemented constraints and indexes:

```sql
alter table public.anomalies
add constraint anomalies_engine_version_present
check (length(btrim(anomaly_engine_version)) > 0);

alter table public.anomalies
add constraint anomalies_fingerprint_format
check (fingerprint is null or fingerprint ~ '^[a-f0-9]{64}$');

alter table public.anomalies
add constraint anomalies_evidence_refs_no_nulls
check (array_position(evidence_refs, null) is null);

alter table public.anomalies
add constraint anomalies_metadata_is_object
check (jsonb_typeof(metadata) = 'object');

create unique index anomalies_run_engine_fingerprint_unique_idx
on public.anomalies (deployment_run_id, anomaly_engine_version, fingerprint)
where fingerprint is not null;

create index anomalies_run_category_idx
on public.anomalies (deployment_run_id, category)
where category is not null;

create index anomalies_run_severity_idx
on public.anomalies (deployment_run_id, severity);
```

If future work creates new public tables or changes role exposure, the migration should include explicit `GRANT` statements alongside RLS policy changes. Supabase now treats table grants and RLS as separate access layers for Data API visibility.

Phase 4C does not create new public tables. It alters the existing `anomalies` table and keeps the existing RLS policies and organization/run guards.

## Row Builder Readiness

Phase 4C adds pure server-side row builders in `packages/ingestion`:

- `parseAnomalyEvidenceRef`
- `buildAnomalyWriteRows`
- `buildAnomalyEvidenceLinkRows`

These builders validate organization/run scope, parse allowlisted evidence refs, sort and dedupe evidence refs, generate stable fingerprints, and build compact metadata. They do not create a Supabase client and do not call `.upsert()`.

## Server Boundary

Anomaly persistence should live in `packages/ingestion` or another server-only package, not in `packages/analyzers` and not in browser code.

Implemented package-level API shape:

```ts
persistFixtureAnomalies(client, {
  organizationId,
  deploymentRunId,
  anomalyEngineVersion: "anomaly-engine-v1",
});
```

The function:

1. Resolve the `deployment_runs` row by `organizationId` and `deploymentRunId`.
2. Read scoped persisted Terraform and Checkov parser rows.
3. Map persisted rows into Phase 4A analyzer input.
4. Run deterministic anomaly detection.
5. Parse and verify each `evidenceRefs` value against resolved source rows.
6. Build anomaly write rows with deterministic fingerprints.
7. Upsert anomalies.
8. Upsert evidence links from source evidence records to anomaly rows.
9. Return persisted anomaly IDs, fingerprints, categories, severities, and evidence-link rows.

Browser code must never call this function directly and must never receive service-role credentials.

## Evidence Reference Mapping

Phase 4A emits evidence refs as strings:

```text
deployment_runs:<id>
terraform_plans:<id>
terraform_resource_changes:<id>
iac_scan_findings:<id>
```

Persistence parses only this allowlisted format:

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

Anomaly persistence must be replay-safe. Re-running the same deterministic anomaly engine for the same deployment run should update the same anomaly rows and not duplicate evidence links. Phase 4C adds the conflict key fields and row-builder fingerprints. Phase 4D uses those conflict keys in trusted package-level upserts.

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

Upsert conflict target:

```text
deployment_run_id, anomaly_engine_version, fingerprint
```

Replay behavior:

- Same anomaly and same evidence refs: update title, summary, severity, category, detected_at, metadata, and evidence_refs in place.
- Same anomaly with changed wording: update the existing row.
- Same category with changed evidence refs: create a distinct row because the evidence changed.
- Previously persisted anomaly missing from a later replay: leave it untouched in the first implementation. A later lifecycle phase can add `stale_at`, `resolved_at`, or `status`.
- Evidence links: upsert by the existing `evidence_links_unique_idx` key and do not delete missing links until lifecycle semantics exist.

## RLS-Safe Access Model

Anomaly persistence can safely run in two modes:

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

Application code still validates these relationships before writes so errors are clear and testable before database triggers reject invalid rows.

## Test Plan

Phase 4C tests now cover:

- Unit tests for `evidenceRefs` parsing, including invalid table names, invalid IDs, missing separators, duplicate refs, and unsupported tables.
- Unit tests for anomaly row builders that verify snake_case columns, deterministic fingerprints, metadata shape, `evidence_refs`, and scope validation.
- Unit tests for evidence link row builders that map each supported evidence table to `anomalies` with label `supports_anomaly`.
- Tenant safety tests that reject mismatched anomaly organization/run IDs.
- Property-oriented tests that generate anomaly evidence refs with duplicate and shuffled evidence refs, then assert stable fingerprints and duplicate-free normalized evidence refs.

Future orchestration tests should add:

- Idempotency tests that persist the same anomalies twice and verify stable anomaly rows plus duplicate-free evidence links.
- Replay tests where anomaly wording changes but evidence refs stay the same, verifying an update instead of a duplicate.
- Evidence-change tests where evidence refs change, verifying a new fingerprint.
- Evidence ownership tests that reject evidence refs from another organization or another run.
- Failure tests for missing deployment run, missing evidence source, anomaly upsert failure, and evidence-link upsert failure.
- Static safety tests or review checks confirming the persistence module does not call LLMs, execute Terraform, execute Checkov, spawn shell commands, read cloud credentials, or expose service-role keys to browser code.

Phase 4D now covers package-level orchestration tests for fixture/parser data:

- Persist anomalies and evidence links from scoped persisted parser rows.
- Replay the same parser state without duplicate anomaly or evidence-link rows.
- Return no writes when no anomaly rules match.
- Reject missing deployment runs before writes.
- Reject multiple Terraform plan rows in fixture scope.

## Implementation Readiness Checklist

Phase 4C has added:

- A migration for `anomaly_engine_version`, `fingerprint`, `evidence_refs`, metadata, constraints, and indexes.
- Row builders in server-only package code.

Phase 4D has added:

- A persistence orchestration function similar to parser persistence.
- Tests for replay behavior, scoped reads, no-anomaly behavior, and failure cases.

Before route, webhook, or dashboard integration, ADIA still needs:

- API or worker wiring that intentionally calls anomaly persistence after parser persistence.
- Evidence ownership tests against a real Supabase test database.
- Docs updates stating which runtime flows persist anomalies automatically.

Until then, anomaly persistence is available only to trusted server-side package callers and the local parsed-fixture replay path.
