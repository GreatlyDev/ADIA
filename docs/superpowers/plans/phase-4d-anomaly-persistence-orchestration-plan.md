# Phase 4D Anomaly Persistence Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist deterministic Phase 4A anomalies and supporting evidence links for already-validated fixture/parser data.

**Architecture:** Add a server-only orchestration module in `packages/ingestion` that reads scoped persisted parser rows, maps them into analyzer input using persisted IDs, runs the anomaly engine, verifies evidence refs, then upserts anomalies and evidence links with Phase 4C row builders.

**Tech Stack:** TypeScript, Supabase JS-style query builders, Vitest, fast-check already available in the workspace.

---

### Task 1: Orchestration Tests

**Files:**

- Create: `packages/ingestion/test/fixtureAnomalyPersistence.test.ts`

- [x] Write a failing test for persisting anomalies from existing deployment/parser rows.
- [x] Write a failing replay test showing duplicate-free anomaly and evidence-link rows.
- [x] Write failure tests for missing deployment run and ambiguous multiple Terraform plans.
- [x] Run the focused test and confirm it fails because the orchestration module does not exist.

### Task 2: Orchestration Module

**Files:**

- Create: `packages/ingestion/src/fixtureAnomalyPersistence.ts`
- Modify: `packages/ingestion/src/index.ts`

- [x] Add `persistFixtureAnomalies`.
- [x] Resolve deployment run, Terraform plan rows, Terraform resource change rows, and IaC findings by organization/run scope.
- [x] Reject multiple Terraform plans for fixture scope.
- [x] Map persisted rows into Phase 4A analyzer input.
- [x] Verify generated evidence refs against resolved scoped evidence refs.
- [x] Upsert anomalies with `ANOMALY_ON_CONFLICT`.
- [x] Upsert evidence links with `EVIDENCE_LINK_ON_CONFLICT`.
- [x] Export the module from `@adia/ingestion`.

### Task 3: Documentation And Verification

**Files:**

- Modify: `README.md`
- Modify: `docs/ANOMALY_PERSISTENCE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/PRD.md`
- Modify: `docs/SUPABASE_SCHEMA.md`

- [x] Update current status and boundaries.
- [x] Document that anomaly persistence is package-level server orchestration only.
- [x] Run typecheck, tests, formatting, filename scan, safety scan, and git diff checks.
