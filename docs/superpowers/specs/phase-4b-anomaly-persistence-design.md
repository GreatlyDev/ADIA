# Phase 4B Anomaly Persistence Planning Design

## Goal

Define how deterministic `Anomaly` objects from Phase 4A will be persisted to Supabase in a future phase.

## Scope

Phase 4B includes documentation only:

- An anomaly persistence design in `docs/ANOMALY_PERSISTENCE.md`.
- Idempotency and replay rules.
- Evidence-link mapping from Phase 4A `evidenceRefs`.
- RLS-safe server-side boundaries.
- Future migration and test expectations.
- Project documentation updates.

Phase 4B does not include:

- Migrations.
- TypeScript row builders.
- Supabase writes.
- API routes or webhook workers.
- LLM calls.
- Terraform, Checkov, or cloud command execution.

## Design Summary

Future anomaly persistence should run after parser persistence. The persistence boundary will accept a deployment run scope and in-memory `Anomaly[]` values, verify every anomaly and evidence reference belongs to that scope, then upsert `anomalies` and `evidence_links`.

The future migration should add replay-safe columns to `anomalies`: `anomaly_engine_version`, `fingerprint`, `evidence_refs`, and compact `metadata`.

Evidence links should point from source evidence records to anomaly records with label `supports_anomaly`.

## Safety Constraints

The future writer must be server-only. Browser code must read anomalies through RLS-protected queries and must never receive service-role keys.

The future implementation should fail closed when evidence references are malformed, unsupported, missing, or cross-tenant.

## Verification For This Phase

Because this phase is planning only, verification should focus on docs quality:

- Prettier check.
- No dated filenames.
- No migrations or TypeScript persistence code added.
- Safety scan for LLM calls, child processes, Terraform/Checkov execution, and exposed secrets.
