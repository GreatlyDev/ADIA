# Phase 2C GitHub Actions Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested GitHub Actions workflow-run adapter that maps sanitized event data into ADIA ingestion envelopes.

**Architecture:** Keep the adapter pure inside `@adia/ingestion`. It accepts explicit ADIA context and evidence references, maps GitHub workflow-run status/conclusion into ADIA deployment status, validates the generated envelope, and returns it without any Supabase writes or webhook handling.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, ADIA core ingestion contracts.

---

## Files

- Create `packages/ingestion/src/githubActionsAdapter.ts`.
- Create `packages/ingestion/test/githubActionsAdapter.test.ts`.
- Modify `packages/ingestion/src/index.ts`.
- Create `scripts/fixtures/github-actions/workflow-run-event.json`.
- Modify `docs/INGESTION_FIXTURES.md`.
- Modify `README.md`.

## Tasks

### Task 1: Design And Plan

- [ ] Add design doc.
- [ ] Add implementation plan.
- [ ] Commit docs with message `Document Phase 2C GitHub Actions adapter design`.

### Task 2: Adapter Tests First

- [ ] Add tests for successful workflow-run conversion.
- [ ] Add status/conclusion mapping tests.
- [ ] Add invalid event and unsafe evidence tests.
- [ ] Run `pnpm --filter @adia/ingestion test` and verify it fails because the adapter module is missing.

### Task 3: Implement Adapter

- [ ] Implement event and adapter option types.
- [ ] Implement status/conclusion mapping.
- [ ] Implement required-field validation.
- [ ] Build and validate an `IngestionEnvelope`.
- [ ] Export the adapter.
- [ ] Run focused tests and typecheck.
- [ ] Commit adapter with message `Add GitHub Actions ingestion adapter`.

### Task 4: Fixture And Docs

- [ ] Add sanitized workflow-run event fixture.
- [ ] Update README and ingestion fixture docs.
- [ ] Run format.
- [ ] Commit fixture/docs with message `Document GitHub Actions adapter fixture`.

### Task 5: Verification And Push

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm format`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm exec tsx scripts/ingest-demo.ts`.
- [ ] Run `pnpm exec tsx scripts/ingest-fixture-to-supabase.ts --help`.
- [ ] Run filename-date scan.
- [ ] Run forbidden-scope scan.
- [ ] Push `main` to `origin`.
