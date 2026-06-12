# Ingestion Fixtures

ADIA uses fixture-first development so ingestion contracts can be designed and tested before connecting real GitHub, Supabase, Terraform, Checkov, or LLM services.

## Current Scope

Phase 2 supports fixture-first ingestion. Phase 3A adds fixture-first Terraform plan analysis, and Phase 3B adds fixture-first Checkov parsing:

- One deployment run per fixture envelope.
- Shallow evidence references for Terraform plan JSON, Checkov JSON, and logs.
- Runtime validation through `packages/core`.
- Local evidence-file existence checks.
- Optional Supabase writes for `deployment_runs` and `raw_evidence_files` metadata through fixture replay and verified GitHub webhook persistence.
- Signature-verified GitHub `workflow_run` webhook mapping with dry-run responses and non-dry-run persistence.
- Deterministic Terraform plan summary parsing for already-loaded fixture JSON in `packages/analyzers`.
- Deterministic Checkov finding parsing for already-loaded fixture JSON in `packages/analyzers`.
- Parser persistence planning in `docs/PARSER_PERSISTENCE.md`.
- No persistence of Terraform or Checkov parser output yet.
- No LLM calls.

## Fixture Layout

```text
scripts/fixtures/
  github-actions/      ADIA envelopes and sanitized GitHub workflow-run event samples
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

## Terraform Plan Parser

Phase 3A adds a package-level Terraform `show -json` parser for sanitized fixture data:

```bash
pnpm --filter @adia/analyzers test
```

The parser summarizes:

- Creates, updates, deletes, and replacements.
- Resource addresses, types, names, providers, and module addresses.
- IAM-related changes.
- Networking-related changes.
- Public exposure indicators such as public CIDR ranges or public accessibility flags.

Parser output currently stays in memory. It is not written to Supabase, exposed through an API route, or used for LLM insight generation yet.

## Checkov Parser

Phase 3B adds a package-level Checkov JSON parser for sanitized fixture data:

```bash
pnpm --filter @adia/analyzers test
```

The parser normalizes:

- Failed, passed, skipped, and unknown findings.
- Check IDs and check names.
- Severity values into ADIA `info`, `low`, `medium`, `high`, and `critical`.
- Resource addresses, file paths, guidelines, and JSON-location evidence references.

Parser output currently stays in memory. It is not written to Supabase, exposed through an API route, used for LLM insight generation, or produced by executing Checkov.

## GitHub Actions Adapter

Phase 2C adds a pure GitHub Actions workflow-run event adapter in `packages/ingestion`. It maps sanitized GitHub event data into the broader ADIA ingestion envelope.

The adapter requires explicit ADIA context:

- `organizationSlug`
- `projectSlug`
- `environment`
- Evidence references for Terraform, Checkov, and logs

GitHub workflow-run events do not contain trusted Terraform, Checkov, or log fixture paths, so the adapter does not invent evidence paths.

Current GitHub Actions fixtures:

- `scripts/fixtures/github-actions/workflow-run-event.json`: upstream-style GitHub workflow-run event data.
- `scripts/fixtures/github-actions/deploy-staging.json`: ADIA ingestion envelope data for replay.

## GitHub Workflow Run Webhook Route

Phase 2D adds a server-side Next.js route, and Phase 2E adds Supabase persistence for non-dry-run requests:

```text
POST /api/ingest/github/workflow-run
```

The route verifies `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET` before parsing the JSON body. Signed events that are not `workflow_run` are acknowledged and ignored.

Dry-run mode returns the generated ADIA ingestion envelope:

```text
POST /api/ingest/github/workflow-run?dryRun=true
```

The route loads ADIA context from server-side environment variables:

- `ADIA_GITHUB_WEBHOOK_ORGANIZATION_SLUG`
- `ADIA_GITHUB_WEBHOOK_PROJECT_SLUG`
- `ADIA_GITHUB_WEBHOOK_ENVIRONMENT`
- `ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON`

With `dryRun=true`, the route verifies, validates, maps, and returns the generated envelope without creating a Supabase client.

Without `dryRun=true`, the route persists one `deployment_runs` row and one `raw_evidence_files` row per configured evidence reference. It does not fetch GitHub artifacts or read evidence files, so webhook-created raw evidence rows have empty file size and SHA-256 hash values until artifact ingestion is added.

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

- GitHub artifact ingestion.
- Terraform parser persistence and API wiring.
- Checkov parser persistence and API wiring.
- Deterministic anomaly detection.
- Evidence-linked LLM insight generation.

The fixture contract should remain useful as a local replay path even after real ingestion APIs exist.
