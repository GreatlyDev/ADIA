# Phase 4A Anomaly Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic in-memory anomaly generation over validated deployment run, Terraform parser, and Checkov parser data.

**Architecture:** Keep anomaly detection as a pure analyzer package function. The function accepts ADIA core domain objects and returns `Anomaly[]` with stable IDs and evidence refs. Persistence, API routes, dashboard wiring, LLM calls, and infrastructure execution remain outside this phase.

**Tech Stack:** TypeScript, `@adia/core`, Vitest, fast-check.

---

## Files

- Modify: `packages/analyzers/src/anomalyEngine.ts`
- Create: `packages/analyzers/test/anomalyEngine.test.ts`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PRD.md`
- Modify: `docs/DECISIONS.md`

## Tasks

### Task 1: Write Failing Tests

- [ ] Add example tests for failed deployments, long duration, Terraform public exposure, Terraform blast radius, and Checkov failed finding anomalies.
- [ ] Add a property-based invariant test for generated parser data.
- [ ] Run the new anomaly test and confirm it fails because the stub returns no anomalies.

### Task 2: Implement Engine

- [ ] Update `AnomalyEngineInput` to accept a `DeploymentRun`, optional Terraform summary/resource changes, optional IaC findings, optional thresholds, and optional deterministic `detectedAt`.
- [ ] Add deterministic rule helpers and stable anomaly construction.
- [ ] Ensure every anomaly has organization/run scope, severity, category, title, summary, detectedAt, and non-empty evidence refs.
- [ ] Keep the implementation pure and free of file, network, Supabase, LLM, Terraform, Checkov, or cloud execution.

### Task 3: Update Docs

- [ ] Update current status and planned phase language.
- [ ] Add an ADR for fixture-only deterministic anomaly generation.
- [ ] State that anomalies are not persisted or wired into routes yet.

### Task 4: Verify

- [ ] Run Prettier.
- [ ] Run TypeScript checks.
- [ ] Run analyzer tests, including the new anomaly tests.
- [ ] Run safety scans for dated filenames, secrets, LLM calls, child processes, Terraform/Checkov execution, and diff whitespace.
