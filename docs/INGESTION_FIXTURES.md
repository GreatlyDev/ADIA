# Ingestion Fixtures

ADIA uses fixture-first development so ingestion contracts can be designed and tested before connecting real GitHub, Supabase, Terraform, Checkov, or LLM services.

## Current Scope

Phase 2 currently supports fixture-first ingestion:

- One deployment run per fixture envelope.
- Shallow evidence references for Terraform plan JSON, Checkov JSON, and logs.
- Runtime validation through `packages/core`.
- Local evidence-file existence checks.
- Optional Supabase writes for `deployment_runs` and `raw_evidence_files` metadata through `packages/ingestion`.
- No webhook ingestion.
- No Terraform or Checkov parsing.
- No LLM calls.

## Fixture Layout

```text
scripts/fixtures/
  github-actions/      Deployment run envelopes from GitHub Actions-style events
  terraform-plans/     terraform show -json output samples
  checkov/             Checkov JSON output samples
  logs/                Plain-text CI/CD or deployment log samples
```

Fixture filenames should describe the scenario without embedding dates. Timestamps belong inside fixture content when they are part of the evidence.

## Run The Demo

```bash
pnpm exec tsx scripts/ingest-demo.ts
```

Expected output:

```text
ADIA ingestion fixture validated
Organization: adia-demo-org
Project: adia-demo-service
Run: Deploy staging from GitHub Actions
Status: succeeded
Evidence:
- Terraform plan: terraform-plans/demo-plan.json
- IaC scan: checkov/demo-checkov.json
- Log: logs/deploy-staging.log
```

You can pass a different envelope path relative to `scripts/fixtures`:

```bash
pnpm exec tsx scripts/ingest-demo.ts github-actions/deploy-staging.json
```

The script rejects absolute paths, path traversal, duplicate separators, and missing evidence files.

## Write A Fixture To Supabase

Phase 2B adds a server-only CLI that validates the same fixture envelope, computes raw evidence file size and SHA-256 metadata, and writes:

- One `deployment_runs` row.
- One `raw_evidence_files` row per evidence reference.

View usage:

```bash
pnpm exec tsx scripts/ingest-fixture-to-supabase.ts --help
```

Run ingestion with the default fixture:

```bash
pnpm exec tsx scripts/ingest-fixture-to-supabase.ts
```

Required server-side environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Alternative RLS-authenticated environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_INGESTION_ACCESS_TOKEN=
```

`SUPABASE_SERVICE_ROLE_KEY` is for trusted local/server jobs only. It must never be exposed to browser code.

The Supabase-backed CLI still does not parse Terraform, parse Checkov, call LLMs, or execute infrastructure commands.

## Envelope Contract

Fixture envelopes use `schemaVersion: "adia.ingestion.v1"` and include:

- `source`: `github_actions`, `manual`, or `fixture`.
- `organizationSlug` and `projectSlug`: lowercase slugs.
- `run`: deployment run identity, status, environment, timestamps, and optional GitHub metadata.
- `evidence`: references to Terraform plan, IaC scan, and log files.
- `metadata`: optional context for future ingestion phases.

This envelope is intentionally broader than a single GitHub event shape so future ingestion sources can map into the same safe contract.

## Future Work

Later phases will add:

- GitHub webhook validation.
- Terraform plan parsing.
- Checkov finding parsing.
- Deterministic anomaly detection.
- Evidence-linked LLM insight generation.

The fixture contract should remain useful as a local replay path even after real ingestion APIs exist.
