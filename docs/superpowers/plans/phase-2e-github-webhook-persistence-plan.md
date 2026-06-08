# Phase 2E GitHub Webhook Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist verified GitHub `workflow_run` webhook envelopes to Supabase while preserving dry-run mode.

**Architecture:** Reuse the existing server-side Supabase ingestion path for validated ADIA envelopes. Keep signature verification and mapping in `githubWebhook.ts`; add a small persistence response helper there; keep the Next route responsible for choosing dry-run versus persistence and creating the server-only Supabase client only when a write is needed.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Supabase JS server client, Vitest.

---

### Task 1: Persistence Tests

**Files:**

- Modify: `packages/ingestion/test/githubWebhook.test.ts`

- [ ] Add a failing test that non-dry-run webhook processing exposes the mapped envelope for persistence without returning the full envelope in the response body.
- [ ] Add a failing test that persisting the mapped envelope writes deployment run and raw evidence metadata through the existing Supabase ingestion path.
- [ ] Add a failing test that Supabase persistence errors become typed webhook error responses.
- [ ] Run `pnpm --filter @adia/ingestion test` and verify the new tests fail because the persistence helper does not exist.

### Task 2: Persistence Helper

**Files:**

- Modify: `packages/ingestion/src/githubWebhook.ts`

- [ ] Add a `persistGitHubWorkflowRunWebhookEnvelope` helper that calls `ingestFixtureEnvelope`.
- [ ] Return a persisted response body with deployment run and raw evidence identifiers.
- [ ] Add a persistence error conversion helper.
- [ ] Keep dry-run mapping behavior unchanged.
- [ ] Run `pnpm --filter @adia/ingestion test` and verify the package tests pass.

### Task 3: Route Wiring

**Files:**

- Modify: `apps/web/app/api/ingest/github/workflow-run/route.ts`

- [ ] Import `createSupabaseServerClient`.
- [ ] For `dryRun=true`, return the Phase 2D dry-run response without creating a Supabase client.
- [ ] For non-dry-run successful mappings, create the server-only Supabase client and persist the mapped envelope.
- [ ] Convert persistence failures into JSON error responses.
- [ ] Run `pnpm --filter @adia/web typecheck`.

### Task 4: Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/INGESTION_FIXTURES.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/SUPABASE_SCHEMA.md`

- [ ] Document that Phase 2E persists verified webhook mappings.
- [ ] Document that dry-run mode remains no-write.
- [ ] Document that evidence sizes and hashes remain null for webhook persistence until artifact ingestion exists.
- [ ] Add an ADR for reusing the validated envelope persistence path.

### Task 5: Verification

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm format`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm exec tsx scripts/ingest-demo.ts`.
- [ ] Run `pnpm exec tsx scripts/ingest-fixture-to-supabase.ts --help`.
- [ ] Run the date-in-filenames scan.
- [ ] Run the safety scan for secrets, LLM calls, Terraform execution, and process execution.
