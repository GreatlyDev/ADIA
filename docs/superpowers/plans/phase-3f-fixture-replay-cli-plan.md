# Phase 3F Fixture Replay CLI Plan

## Objective

Add a local server-side fixture replay CLI that validates an existing ingestion envelope, reads local Terraform and Checkov fixture JSON, runs deterministic parsers, and calls Phase 3E persistence orchestration.

## Tasks

1. Write failing tests for fixture replay behavior.
2. Add a package-level replay function that composes existing ingestion, analyzers, and parser persistence.
3. Add `@adia/analyzers` as an ingestion package dependency.
4. Add the local CLI wrapper under `scripts/`.
5. Add a root command for local replay.
6. Update README, fixture docs, architecture, PRD, decisions, and parser persistence docs.
7. Verify formatting, TypeScript, tests, filename rules, and safety scans.

## Constraints

- No dated filenames.
- No API routes.
- No LLM calls.
- No Terraform, Checkov, artifact, or cloud execution.
