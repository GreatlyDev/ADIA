# Phase 2D GitHub Webhook Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side GitHub `workflow_run` webhook route that verifies signatures and maps requests into ADIA ingestion envelopes without persistence or execution.

**Architecture:** Keep security-sensitive webhook behavior in `packages/ingestion` and test it with Vitest. Keep the Next.js route thin: read the raw body, load server-side config, call the ingestion helper, and serialize the response.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Node `crypto`, Vitest.

---

### Task 1: Webhook Helper Tests

**Files:**

- Create: `packages/ingestion/test/githubWebhook.test.ts`

- [ ] Write failing tests for signed dry-run mapping, invalid signatures, ignored signed non-workflow events, invalid JSON, adapter validation errors, and environment config loading.
- [ ] Run `pnpm --filter @adia/ingestion test` and verify the tests fail because the webhook helper does not exist.

### Task 2: Webhook Helper Implementation

**Files:**

- Create: `packages/ingestion/src/githubWebhook.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] Implement HMAC SHA-256 signature verification using constant-time comparison.
- [ ] Implement server-side env config loading for the GitHub webhook route.
- [ ] Implement raw payload processing that verifies before parsing.
- [ ] Map signed `workflow_run` bodies through `githubWorkflowRunEventToIngestionEnvelope`.
- [ ] Export the helper from `packages/ingestion`.
- [ ] Run `pnpm --filter @adia/ingestion test` and verify the new tests pass.

### Task 3: Next.js Route

**Files:**

- Create: `apps/web/app/api/ingest/github/workflow-run/route.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/tsconfig.json`

- [ ] Add `@adia/ingestion` as a web app workspace dependency.
- [ ] Include ingestion source files in the web app TypeScript project.
- [ ] Add the Node.js route handler that reads the raw request body and delegates to the tested helper.
- [ ] Run `pnpm --filter @adia/web typecheck`.

### Task 4: Documentation

**Files:**

- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/INGESTION_FIXTURES.md`
- Modify: `docs/DECISIONS.md`

- [ ] Document the server-only webhook configuration variables.
- [ ] Document that Phase 2D verifies and maps webhooks but does not persist, parse evidence, call LLMs, or execute infrastructure commands.
- [ ] Add an ADR for signature verification before payload parsing.

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
