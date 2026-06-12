# Phase 3B Checkov Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic Checkov fixture parsing into ADIA IaC scan findings.

**Architecture:** Keep the parser as a pure function in `packages/analyzers`. Use the existing core `IacScanFinding`, `IacFindingStatus`, and `Severity` contracts. Add example-based and property-based tests before implementation.

**Tech Stack:** TypeScript, Vitest, fast-check, pnpm workspaces.

---

### Task 1: Parser Tests

**Files:**

- Create: `packages/analyzers/test/iacScanParser.test.ts`

- [x] Add example-based tests for failed, passed, skipped, and unknown Checkov findings.
- [x] Add tests for severity normalization from Checkov strings into ADIA severities.
- [x] Add a fixture smoke test for `scripts/fixtures/checkov/demo-checkov.json`.
- [x] Add property-based tests that generate valid Checkov result arrays and verify count, status, severity, and evidence-reference invariants.
- [x] Run analyzer tests and verify the new tests fail against the stub parser.

### Task 2: Deterministic Parser

**Files:**

- Modify: `packages/analyzers/src/iacScanParser.ts`

- [x] Add `organizationId` to `IacScanParserInput`.
- [x] Parse Checkov result arrays only when `results` is an object and the category value is an array.
- [x] Normalize statuses from result array names.
- [x] Normalize severities case-insensitively, defaulting missing or unknown values to `info`.
- [x] Populate deterministic IDs, evidence references, check IDs, titles, resource, file path, and guideline.
- [x] Run analyzer tests and verify they pass.

### Task 3: Fixture Coverage

**Files:**

- Modify: `scripts/fixtures/checkov/demo-checkov.json`
- Modify: `scripts/fixtures/checkov/README.md`

- [x] Expand the demo Checkov fixture with sanitized failed, passed, skipped, and unknown checks.
- [x] Keep fixture content static and safe.
- [x] Do not include credentials, real account IDs, private IPs, or sensitive resource names.
- [x] Update the Checkov fixture README from future tense to current fixture parser coverage.

### Task 4: Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/INGESTION_FIXTURES.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/PRD.md`

- [x] Document that Phase 3B parses Checkov fixture JSON into deterministic findings only.
- [x] Document that parser output is not persisted yet.
- [x] Document that Checkov is not executed by ADIA in this phase.
- [x] Add an ADR for deterministic fixture-only Checkov parsing before persistence or LLM use.

### Task 5: Verification

Codex note: this Windows session denied some package-manager command shims, so final checks were run through direct bundled Node equivalents for TypeScript, Vitest, ESLint, Prettier, Next.js, and TSX. The webpack production build completed successfully.

- [x] Run analyzer tests.
- [x] Run workspace TypeScript checks.
- [x] Run workspace tests.
- [x] Run lint.
- [x] Run format.
- [x] Run build.
- [x] Run `scripts/ingest-demo.ts`.
- [x] Run `scripts/ingest-fixture-to-supabase.ts --help`.
- [x] Run the date-in-filenames scan.
- [x] Run the safety scan for secrets, Supabase client creation, LLM calls, Terraform/Checkov execution, and process execution.
