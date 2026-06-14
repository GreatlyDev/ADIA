# Phase 4B Anomaly Persistence Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the future Supabase persistence design for deterministic Phase 4A anomalies without implementing persistence.

**Architecture:** Phase 4B is documentation-only. It describes a future server-only writer that validates organization/run scope, upserts replay-safe anomaly rows, and links source evidence records to anomaly records through `evidence_links`.

**Tech Stack:** Markdown, Supabase Postgres, existing ADIA docs.

---

## Files

- Create: `docs/ANOMALY_PERSISTENCE.md`
- Create: `docs/superpowers/specs/phase-4b-anomaly-persistence-design.md`
- Create: `docs/superpowers/plans/phase-4b-anomaly-persistence-plan.md`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PRD.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/SUPABASE_SCHEMA.md`

## Tasks

### Task 1: Document The Persistence Design

- [ ] Define the future anomaly persistence input shape.
- [ ] Document the schema gap and recommended future columns.
- [ ] Define deterministic anomaly fingerprints and conflict keys.
- [ ] Define replay behavior.
- [ ] Define evidence-link mapping from `evidenceRefs`.
- [ ] Define RLS-safe server-only caller boundaries.
- [ ] Define the future test plan.

### Task 2: Update Project Docs

- [ ] Update current status language.
- [ ] Link `docs/ANOMALY_PERSISTENCE.md` from architecture/schema docs.
- [ ] Add an ADR for planning anomaly persistence before implementation.
- [ ] Make clear that no anomaly persistence is implemented yet.

### Task 3: Verify Planning-Only Scope

- [ ] Run Prettier.
- [ ] Run date-like filename scan.
- [ ] Run safety scan for secrets, LLM calls, process execution, Terraform execution, and Checkov execution.
- [ ] Confirm no migration, API route, row builder, or Supabase write code was added.
