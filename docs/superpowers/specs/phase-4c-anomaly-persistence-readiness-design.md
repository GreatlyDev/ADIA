# Phase 4C Anomaly Persistence Readiness Design

## Objective

Prepare ADIA for future anomaly persistence without writing anomalies to Supabase yet.

This phase adds:

- Replay-safe anomaly schema fields.
- Constraints and indexes for future idempotent upserts.
- Pure TypeScript row builders that map Phase 4A `Anomaly` objects into future Supabase write rows.
- Evidence-link row builders that translate parsed `evidenceRefs` into `evidence_links` rows.
- Unit and property-oriented tests for mapping behavior.

This phase does not add Supabase write orchestration, API routes, LLM calls, Terraform execution, Checkov execution, cloud commands, artifact download, or dashboard wiring.

## Schema Readiness

The existing `public.anomalies` table already stores organization/run scope, severity, category, title, summary, and `detected_at`.

Phase 4C adds:

- `anomaly_engine_version`
- `fingerprint`
- `evidence_refs`
- `metadata`

The future conflict key is:

```text
deployment_run_id, anomaly_engine_version, fingerprint
```

The fingerprint is nullable for legacy rows, while new deterministic anomaly rows should include a 64-character SHA-256 fingerprint.

## Row Builder Boundary

Row builders live in `packages/ingestion` because anomaly persistence is server-side infrastructure code, not analyzer code and not browser code.

The builders:

- Reject organization/run scope mismatches.
- Parse only allowlisted evidence ref formats.
- Normalize evidence refs by sorting and deduplicating them.
- Generate stable anomaly fingerprints.
- Build compact metadata.
- Build duplicate-safe `evidence_links` rows after a caller provides persisted anomaly IDs.

The builders do not create a Supabase client and do not call `.upsert()`.

## Evidence Reference Format

Supported evidence refs:

```text
deployment_runs:<id>
terraform_plans:<id>
terraform_resource_changes:<id>
iac_scan_findings:<id>
```

Unsupported or malformed refs fail closed so ADIA does not persist unsupported evidence relationships silently.

## Tests

Tests cover:

- Supported evidence ref parsing.
- Invalid evidence ref rejection.
- Snake-case anomaly row mapping.
- Stable replay fingerprints across duplicate refs, ref order, summary changes, and timestamp changes.
- Scope mismatch rejection.
- Generated evidence ref normalization checks.
- Evidence link row mapping to `anomalies`.
- Missing persisted anomaly ID rejection.
