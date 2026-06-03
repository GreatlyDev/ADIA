# Phase 2B Supabase Fixture Ingestion Design

## Goal

Phase 2B adds Supabase-backed ingestion for validated fixture envelopes only. ADIA will write one `deployment_runs` row and raw evidence-file metadata for each fixture run.

This phase does not parse Terraform plans, parse Checkov output, ingest webhooks, call LLMs, or execute Terraform/cloud commands.

## Recommended Approach

Use a small server-only `@adia/ingestion` package plus a Node CLI script.

Alternatives considered:

- Put Supabase writes directly in `scripts/ingest-demo.ts`: simplest, but hard to test and easy to mix CLI/file concerns with database behavior.
- Put Supabase writes inside `packages/core`: convenient imports, but `core` should remain browser-safe shared contracts.
- Create `packages/ingestion`: slightly more structure, but it cleanly isolates server-side Supabase write behavior and is easier to test.

Chosen approach: `packages/ingestion`.

## Data Model

Phase 1 already has `deployment_runs`, but no generic raw evidence metadata table. Phase 2B adds `raw_evidence_files`:

- `organization_id`
- `deployment_run_id`
- `kind`
- `format`
- `path`
- `label`
- `size_bytes`
- `content_sha256`
- `metadata`

The table stores metadata only. It does not store raw file contents and does not interpret evidence.

`deployment_runs` also gets a unique constraint on `(organization_id, project_id, source, external_run_id)` so fixture ingestion can upsert runs when the fixture has an external run ID.

## RLS And Safety

`raw_evidence_files` uses the same tenant pattern as existing evidence tables:

- Authenticated org members can read.
- Owners/admins can insert, update, and delete.
- A trigger verifies every evidence row belongs to a deployment run in the same organization.

The CLI is server-side only. It may use `SUPABASE_SERVICE_ROLE_KEY` for trusted local fixture replay, but that key must never be exposed to browser code. The ingestion package resolves organization and project IDs by slug and writes scoped rows only.

## Runtime Flow

```text
scripts/fixtures/github-actions/deploy-staging.json
        |
        v
validateIngestionEnvelope()
        |
        v
verify referenced fixture files exist
        |
        v
compute evidence metadata without parsing contents
        |
        v
resolve organization + project in Supabase
        |
        v
upsert deployment_runs
        |
        v
upsert raw_evidence_files
```

## Testing

Tests will use a fake Supabase client so no real database or credentials are required.

Coverage:

- Invalid envelopes fail before any database writes.
- Organization and project lookup are scoped by slug and organization ID.
- Deployment runs map fixture fields and duration correctly.
- Evidence rows store path, kind, format, labels, hashes, sizes, and metadata.
- Ingestion returns inserted run and evidence metadata.

## Definition Of Done

- Phase 2B migration creates `raw_evidence_files`, RLS policies, indexes, and tenant consistency triggers.
- Server-only ingestion package writes `deployment_runs` and `raw_evidence_files`.
- CLI can ingest the existing demo fixture when Supabase env vars are configured.
- Existing validation-only demo still works.
- Tests, typecheck, lint, format, build, fixture replay, and safety scans pass.
