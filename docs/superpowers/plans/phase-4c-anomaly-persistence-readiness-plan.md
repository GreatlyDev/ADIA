# Phase 4C Anomaly Persistence Readiness Plan

## Scope

Add anomaly persistence schema readiness and pure row builders only.

Out of scope:

- Supabase write orchestration.
- API routes.
- LLM calls.
- Terraform, Checkov, or cloud execution.
- Dashboard wiring.

## Checklist

- [x] Inspect existing parser persistence row-builder patterns.
- [x] Write tests for anomaly evidence ref parsing, row mapping, replay fingerprints, and evidence links.
- [x] Add `public.anomalies` schema fields for engine version, fingerprint, evidence refs, and metadata.
- [x] Add constraints and indexes for replay-safe anomaly persistence.
- [x] Add pure TypeScript row builders in `packages/ingestion`.
- [x] Export the row builders from the ingestion package.
- [x] Update docs to distinguish schema/readiness work from future Supabase writes.
- [x] Verify focused tests and full package checks.

## Follow-Up Phase

The next implementation phase should add a server-only anomaly persistence orchestration function that:

- Receives validated fixture/parser data.
- Runs or accepts deterministic anomalies from Phase 4A.
- Resolves persisted evidence source IDs.
- Upserts anomaly rows with the Phase 4C conflict key.
- Upserts supporting evidence links.
- Does not expose browser routes or call LLMs.
