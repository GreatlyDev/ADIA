# Phase 4E Fixture Anomaly Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend local parsed fixture replay so it persists deterministic anomalies after parser persistence.

**Architecture:** Keep the integration inside `replayParsedFixture`. After parser persistence succeeds, call Phase 4D `persistFixtureAnomalies` with the same scoped run IDs, then return parser/anomaly counts and total evidence-link counts.

**Tech Stack:** TypeScript, Vitest, Supabase JS-style query builders, existing ADIA analyzer and ingestion packages.

---

### Task 1: Replay Tests

**Files:**

- Modify: `packages/ingestion/test/fixtureReplay.test.ts`

- [x] Update the successful replay test to expect anomaly count and anomaly evidence-link count.
- [x] Extend the fake Supabase client with `anomalies` support and select behavior needed by Phase 4D.
- [x] Add a replay idempotency assertion for anomalies and evidence links.
- [x] Run the focused test and confirm it fails before implementation.

### Task 2: Replay Integration

**Files:**

- Modify: `packages/ingestion/src/fixtureReplay.ts`
- Modify: `scripts/replay-parsed-fixture-to-supabase.ts`

- [x] Import and call `persistFixtureAnomalies` after parser persistence.
- [x] Extend `ReplayParsedFixtureResult` with `anomalyCount`, `parserEvidenceLinkCount`, and `anomalyEvidenceLinkCount`.
- [x] Return total `evidenceLinkCount` as parser plus anomaly evidence links.
- [x] Print anomaly and split evidence-link counts in the local replay script.

### Task 3: Documentation And Verification

**Files:**

- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PRD.md`
- Modify: `docs/SUPABASE_SCHEMA.md`
- Modify: `docs/DECISIONS.md`

- [x] Update status and boundaries for Phase 4E.
- [x] Verify docs still state no routes, LLMs, Terraform/Checkov execution, artifact fetches, or cloud commands.
- [x] Run typecheck, tests, formatting, filename scan, safety scan, and git diff checks.
