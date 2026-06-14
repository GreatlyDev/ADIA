# Phase 4F Anomaly Dashboard/API Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the future RLS-safe read model for persisted anomalies and evidence links before dashboard/API implementation.

**Architecture:** Keep Phase 4F documentation-only. Add a canonical anomaly dashboard/API plan that defines authenticated Supabase reads, DTO contracts, filter behavior, evidence drill-down, Realtime scope, and tests. Update project status docs to point at the plan without adding runtime code.

**Tech Stack:** Supabase Postgres, Supabase RLS, Supabase Realtime, Next.js App Router planning, TypeScript DTO contracts as documentation.

---

### Task 1: Read Existing Context

**Files:**

- Read: `docs/ANOMALY_PERSISTENCE.md`
- Read: `docs/SUPABASE_SCHEMA.md`
- Read: `README.md`
- Read: `docs/PRD.md`
- Read: `docs/ARCHITECTURE.md`
- Read: `supabase/migrations/0001_phase_1_schema.sql`
- Read: `supabase/migrations/0004_phase_4c_anomaly_persistence_readiness.sql`

- [x] Confirm existing anomaly, evidence link, RLS, and index shape.
- [x] Check Supabase RLS, Realtime, and Data API grant guidance.
- [x] Confirm this phase should not add routes, UI wiring, migrations, LLM calls, Terraform execution, Checkov execution, or cloud commands.

### Task 2: Canonical Planning Doc

**Files:**

- Create: `docs/ANOMALY_DASHBOARD_API_PLAN.md`

- [x] Define RLS-safe dashboard/API read boundaries.
- [x] Define future anomaly list, detail, and evidence-link DTO contracts.
- [x] Define project feed, run panel, and anomaly detail query patterns.
- [x] Define filters, evidence drill-down behavior, Realtime scope, and future tests.

### Task 3: Project Status Docs

**Files:**

- Modify: `README.md`
- Modify: `docs/PRD.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/SUPABASE_SCHEMA.md`
- Modify: `docs/ANOMALY_PERSISTENCE.md`
- Modify: `docs/INGESTION_FIXTURES.md`
- Modify: `docs/DECISIONS.md`

- [x] Update current status to include Phase 4F planning.
- [x] Link the new planning document from architecture/schema/anomaly docs.
- [x] Add an ADR for planning the anomaly read model before dashboard/API wiring.
- [x] Remove stale wording that said anomaly persistence does not exist.

### Task 4: Verification

**Files:**

- Verify: changed markdown files only

- [x] Run formatting checks.
- [x] Run filename date scan.
- [x] Run safety scan for accidental route, LLM, Terraform, Checkov, or cloud-command implementation.
- [x] Run git diff checks.
