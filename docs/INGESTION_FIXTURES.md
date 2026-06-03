# Ingestion Fixtures

ADIA uses fixture-first development so ingestion contracts can be designed and tested before connecting real GitHub, Supabase, Terraform, Checkov, or LLM services.

## Current Scope

Phase 2 currently supports a contract-only fixture demo:

- One deployment run per fixture envelope.
- Shallow evidence references for Terraform plan JSON, Checkov JSON, and logs.
- Runtime validation through `packages/core`.
- Local evidence-file existence checks.
- No Supabase writes.
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

- Supabase-backed deployment run ingestion.
- GitHub webhook validation.
- Terraform plan parsing.
- Checkov finding parsing.
- Deterministic anomaly detection.
- Evidence-linked LLM insight generation.

The fixture contract should remain useful as a local replay path even after real ingestion APIs exist.
