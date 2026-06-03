# Phase 2B Supabase Fixture Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side Supabase fixture ingestion that writes `deployment_runs` and raw evidence metadata from already validated fixture envelopes.

**Architecture:** Keep shared contracts in `@adia/core`, add server-only Supabase write logic in `@adia/ingestion`, and expose local fixture replay through a Node CLI script. Add a Supabase migration for `raw_evidence_files` so evidence metadata has a first-class RLS-protected table.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Supabase Postgres, `@supabase/supabase-js`, Node `tsx`.

---

## Files

- Create `supabase/migrations/0002_phase_2b_raw_evidence_files.sql`.
- Create `packages/ingestion/package.json`.
- Create `packages/ingestion/tsconfig.json`.
- Create `packages/ingestion/src/index.ts`.
- Create `packages/ingestion/src/supabaseClient.ts`.
- Create `packages/ingestion/src/supabaseFixtureIngestion.ts`.
- Create `packages/ingestion/test/supabaseFixtureIngestion.test.ts`.
- Create `scripts/ingest-fixture-to-supabase.ts`.
- Modify `tsconfig.base.json`.
- Modify `.env.example`.
- Modify `README.md`.
- Modify `docs/INGESTION_FIXTURES.md`.

## Tasks

### Task 1: Add Phase 2B Docs

- [ ] Write the design doc.
- [ ] Write this implementation plan.
- [ ] Commit docs with message `Document Phase 2B Supabase fixture ingestion design`.

### Task 2: Add Supabase Migration

- [ ] Add `raw_evidence_files` table with tenant columns, evidence metadata, indexes, triggers, and RLS policies.
- [ ] Add a unique deployment-run constraint for external run upserts.
- [ ] Extend evidence-link table validation to allow future links to `raw_evidence_files`.
- [ ] Scan migration for forbidden execution behavior.
- [ ] Commit migration with message `Add raw evidence metadata table`.

### Task 3: Add Failing Ingestion Package Tests

- [ ] Add `@adia/ingestion` package metadata and test script.
- [ ] Add Vitest tests using a fake Supabase client.
- [ ] Run `pnpm --filter @adia/ingestion test` and verify it fails because implementation is missing.

### Task 4: Implement Server-Side Supabase Ingestion

- [ ] Implement mapping helpers for deployment runs and evidence metadata.
- [ ] Implement organization/project lookup.
- [ ] Implement deployment run upsert and raw evidence metadata upsert.
- [ ] Implement server-only Supabase client creation from environment values.
- [ ] Run focused tests and typecheck.
- [ ] Commit package with message `Add Supabase fixture ingestion package`.

### Task 5: Add CLI Wrapper

- [ ] Add `scripts/ingest-fixture-to-supabase.ts`.
- [ ] Reuse existing fixture validation and evidence file checks.
- [ ] Compute file size and SHA-256 hashes without parsing evidence.
- [ ] Print a concise ingestion summary.
- [ ] Run validation-only script and CLI help/error paths.
- [ ] Commit CLI with message `Add Supabase fixture ingestion CLI`.

### Task 6: Update Documentation

- [ ] Update `.env.example` with server-side ingestion notes.
- [ ] Update README local commands.
- [ ] Update `docs/INGESTION_FIXTURES.md`.
- [ ] Run format.
- [ ] Commit docs with message `Document Supabase fixture ingestion`.

### Task 7: Verify And Push

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm format`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm exec tsx scripts/ingest-demo.ts`.
- [ ] Run filename date scan.
- [ ] Run forbidden scope scan for Supabase key exposure, LLM calls, Terraform apply, and child process execution.
- [ ] Commit any final fixes.
- [ ] Push `main` to `origin`.
