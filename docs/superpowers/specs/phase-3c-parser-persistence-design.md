# Phase 3C Parser Persistence Design

## Goal

Design how ADIA will persist Terraform plan summaries, Terraform resource changes, and Checkov findings to Supabase in a future phase without implementing persistence yet.

## Non-Goals

- Do not add schema migrations.
- Do not add persistence code.
- Do not expose parser persistence through an API route.
- Do not call LLM providers.
- Do not execute Terraform, Checkov, cloud CLIs, or shell commands from product code.
- Do not store unredacted raw evidence by default.

## Current State

ADIA already has:

- Validated ingestion envelopes in `@adia/core`.
- Server-side fixture and webhook metadata persistence in `@adia/ingestion`.
- RLS-protected `deployment_runs` and `raw_evidence_files`.
- Existing parser-target tables: `terraform_plans`, `terraform_resource_changes`, `iac_scan_findings`, and `evidence_links`.
- Pure Terraform and Checkov parsers in `@adia/analyzers`.

Parser output is currently in memory only.

## Proposed Future Boundary

Add parser persistence to server-only ingestion code, not to analyzer code:

```text
validated run + raw evidence metadata
        |
        v
load already-available JSON evidence
        |
        v
pure analyzers
        |
        v
server-only parser persistence
        |
        v
Supabase parser tables + evidence_links
```

The persistence boundary must re-resolve the deployment run and raw evidence rows by ID and verify tenant consistency before writing.

## Schema Needs Before Implementation

The current tables can hold parser summaries, changes, and findings, but robust replay requires a small migration:

- Add source evidence references to parser output tables.
- Add parser version fields.
- Add deterministic fingerprints.
- Add `evidence_refs text[]` to `iac_scan_findings`.
- Add unique indexes for replay-safe upserts.
- Add a duplicate-prevention index for `evidence_links`.

The migration should use safe constraint/index creation patterns and should preserve existing RLS.

## Idempotency Model

Terraform plan row identity:

- `deployment_run_id`
- `source_evidence_file_id`
- `parser_version`

Terraform resource change identity:

- `terraform_plan_id`
- deterministic `fingerprint`

Checkov finding identity:

- `deployment_run_id`
- `source_evidence_file_id`
- `scanner`
- deterministic `fingerprint`

Evidence link identity:

- `organization_id`
- `source_table`
- `source_id`
- `target_table`
- `target_id`
- normalized `label`

All writes should use upsert-style semantics instead of select-then-insert behavior.

## RLS And Security Model

Parser persistence must run server-side only. Browser code reads persisted parser output through RLS-protected queries.

Trusted webhook or CLI processing may use a service-role client from server code, but must explicitly validate:

- Deployment run exists.
- Deployment run belongs to the expected organization.
- Raw evidence file belongs to the same organization and deployment run.
- Parser output organization and deployment run IDs match the database rows.

User-initiated parser persistence, if added later, should use an authenticated Supabase session for an owner or admin and rely on normal RLS policies.

## Evidence Model

Every persisted parser output should link back to its source evidence:

- Raw Terraform evidence to Terraform plan: `parsed_from`.
- Terraform plan to resource changes: `contains_change`.
- Raw Checkov evidence to findings: `reported_by`.

The evidence graph is what later makes anomaly output and LLM recommendations grounded instead of free-floating.

## Testing Requirements

Implementation should be test-first:

- Row mapping tests.
- Replay idempotency tests.
- Tenant mismatch rejection tests.
- Evidence link tests.
- Failure-path tests.
- Static safety checks for no command execution and no client-side secret exposure.

Property-based tests are a good fit for fingerprint stability and replay idempotency once the write module exists.
