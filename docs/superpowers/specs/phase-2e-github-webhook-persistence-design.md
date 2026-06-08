# Phase 2E GitHub Webhook Persistence Design

## Goal

Phase 2E persists verified GitHub `workflow_run` webhook mappings to Supabase using the existing ADIA ingestion envelope path.

## Scope

This phase adds persistence only after the Phase 2D checks pass:

- Verify GitHub signature before parsing.
- Map signed `workflow_run` events into ADIA ingestion envelopes.
- Preserve `dryRun=true` as a no-write response path.
- Persist non-dry-run webhook envelopes to `deployment_runs` and `raw_evidence_files`.
- Return persisted deployment run and evidence metadata identifiers.

This phase does not parse Terraform plans, parse Checkov findings, fetch GitHub artifacts, ingest raw log content, call LLM providers, execute Terraform, run cloud commands, or perform remediation.

## Persistence Model

The webhook route reuses `ingestFixtureEnvelope` from `packages/ingestion`. Despite the Phase 2B-oriented name, that function already operates on validated ADIA ingestion envelopes and writes:

- One deployment run row, upserted by organization, project, source, and external run ID.
- One raw evidence metadata row per evidence reference, upserted by deployment run and path.

Webhook evidence metadata does not include file sizes or content hashes yet because Phase 2E does not fetch artifacts or read evidence files. Those columns remain `null` until a later artifact ingestion phase.

## Route Behavior

`POST /api/ingest/github/workflow-run?dryRun=true`

- Verifies and maps the webhook.
- Returns the generated envelope.
- Does not create a Supabase client.
- Does not write to Supabase.

`POST /api/ingest/github/workflow-run`

- Verifies and maps the webhook.
- Creates a server-only Supabase client.
- Persists deployment run and raw evidence metadata rows.
- Returns persisted row identifiers.

## Error Handling

- Invalid signatures still return `401`.
- Invalid JSON still returns `400`.
- Invalid GitHub events or invalid envelopes still return `422`.
- Supabase persistence failures return `500` with a typed server-side error code.

## Testing

Tests stay in `packages/ingestion` for deterministic coverage of mapping and persistence response shaping. The Next route remains thin and is verified by TypeScript and production build checks.
