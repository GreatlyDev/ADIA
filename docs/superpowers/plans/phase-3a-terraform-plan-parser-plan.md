# Phase 3A Terraform Plan Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic Terraform `show -json` fixture parsing into ADIA Terraform plan summaries.

**Architecture:** Keep the parser as a pure function in `packages/analyzers`. Use the existing core `TerraformPlanSummary` and `TerraformResourceChange` contracts. Add example-based and property-based tests before implementation.

**Tech Stack:** TypeScript, Vitest, fast-check, pnpm workspaces.

---

### Task 1: Parser Tests

**Files:**

- Modify: `packages/analyzers/test/terraformPlanParser.test.ts`
- Modify: `packages/analyzers/package.json`

- [x] Add `fast-check` as a dev dependency for `@adia/analyzers`.
- [x] Replace the placeholder test with example-based tests for creates, updates, deletes, replacements, IAM risk, networking risk, and public exposure.
- [x] Add property-based tests that generate valid Terraform resource changes and verify summary count invariants.
- [x] Run `pnpm --filter @adia/analyzers test` and verify the new tests fail against the stub parser.

### Task 2: Deterministic Parser

**Files:**

- Modify: `packages/analyzers/src/terraformPlanParser.ts`

- [x] Parse `resource_changes` only when it is an array.
- [x] Skip `no-op` changes.
- [x] Normalize Terraform action names into ADIA `TerraformResourceAction` values.
- [x] Count replacement changes separately from simple creates and deletes.
- [x] Populate provider, module, evidence path, risk flags, and short change summaries.
- [x] Detect IAM, networking, and public exposure signals with conservative structured checks.
- [x] Run `pnpm --filter @adia/analyzers test` and verify analyzer tests pass.

### Task 3: Fixture Coverage

**Files:**

- Modify: `scripts/fixtures/terraform-plans/demo-plan.json`

- [x] Expand the demo Terraform plan fixture with sanitized resources that exercise parser behavior.
- [x] Keep fixture content static and safe.
- [x] Do not include credentials, real account IDs, or real cloud resource identifiers.

### Task 4: Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/INGESTION_FIXTURES.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/PRD.md`

- [x] Document that Phase 3A parses Terraform fixture JSON into deterministic summaries only.
- [x] Document that parser output is not persisted yet.
- [x] Document that Terraform and cloud commands remain out of scope.
- [x] Add an ADR for deterministic fixture-only Terraform parsing before persistence or LLM use.

### Task 5: Verification

Codex note: this Windows session denied some package-manager command shims, so final checks were run through direct bundled Node equivalents for TypeScript, Vitest, ESLint, Prettier, Next.js, and TSX. The default Turbopack build path hit an environment process-spawn permission error; the webpack production build completed successfully.

- [x] Run `pnpm --filter @adia/analyzers test`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm lint`.
- [x] Run `pnpm format`.
- [x] Run `pnpm build`.
- [x] Run `pnpm exec tsx scripts/ingest-demo.ts`.
- [x] Run `pnpm exec tsx scripts/ingest-fixture-to-supabase.ts --help`.
- [x] Run the date-in-filenames scan.
- [x] Run the safety scan for secrets, Supabase client creation, LLM calls, Terraform execution, and process execution.
