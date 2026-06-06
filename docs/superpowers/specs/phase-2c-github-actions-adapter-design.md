# Phase 2C GitHub Actions Adapter Design

## Goal

Phase 2C adds a pure GitHub Actions workflow-run event adapter that produces ADIA ingestion envelopes from sanitized workflow-run event data plus explicit ADIA context.

This phase does not add a webhook route, write to Supabase directly, parse Terraform, parse Checkov, call LLMs, or execute infrastructure commands.

## Approach

Use `packages/ingestion` because the adapter is part of ingestion, but keep it pure and dependency-light:

- Input: a sanitized subset of a GitHub `workflow_run` event.
- Input: explicit ADIA context: `organizationSlug`, `projectSlug`, `environment`, and evidence references.
- Output: the existing `IngestionEnvelope` from `@adia/core`.
- Validation: run the existing envelope validator before returning.

Alternatives considered:

- Derive project and environment from repository/workflow names. This is convenient, but too implicit for MVP ingestion.
- Put the adapter in `packages/core`. This would keep it close to envelope types, but `core` should remain generic and source-agnostic.
- Add a webhook API route now. This is too early; the adapter should be testable before request signing, auth, and API routing are added.

## Status Mapping

GitHub workflow-run status and conclusion map into ADIA deployment statuses:

- `queued`, `requested`, `waiting`, `pending` -> `queued`
- `in_progress` -> `running`
- completed `success` or `neutral` -> `succeeded`
- completed `cancelled` or `skipped` -> `canceled`
- completed `failure`, `timed_out`, `action_required`, or `stale` -> `failed`
- unknown completed conclusions -> `failed`

## Evidence

The adapter does not invent artifact paths. Callers must pass evidence references explicitly. This keeps the adapter evidence-grounded and avoids pretending a GitHub event contains Terraform or Checkov file locations.

## Fixture

Add `scripts/fixtures/github-actions/workflow-run-event.json` as a sanitized GitHub workflow-run event fixture. It is event data only, not an ADIA envelope.

## Testing

Tests cover:

- Successful workflow-run event conversion into a valid ingestion envelope.
- Status/conclusion mapping table.
- Unsafe evidence paths rejected through envelope validation.
- Missing required GitHub event fields rejected with a typed adapter error.

## Definition Of Done

- Adapter exists in `packages/ingestion`.
- Adapter tests fail before implementation and pass after implementation.
- Sanitized GitHub event fixture exists with no date-stamped filename.
- Docs explain adapter scope and non-goals.
- Full verification and safety scans pass.
