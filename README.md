# ADIA - Automated Deployment Insight Assistant

ADIA is an AI-assisted DevOps visibility dashboard for understanding deployment risk before it becomes an incident. It is designed to ingest deployment events, Terraform plan JSON, IaC scan output, and logs, then combine deterministic analysis with evidence-grounded LLM summaries.

> ADIA helps DevOps engineers understand deployment risk, Terraform changes, and CI/CD anomalies before they become incidents.

## Current Status

Phase 0 and Phase 1 are complete. Phase 2 fixture and GitHub webhook ingestion slices are in place. Phase 3A adds deterministic Terraform plan parsing for sanitized fixture JSON only. Phase 3B adds deterministic Checkov fixture parsing. Phase 3C documents parser persistence, Phase 3D adds schema readiness plus row builders, Phase 3E adds server-only parser persistence orchestration, Phase 3F adds a local fixture replay CLI, Phase 4A adds an in-memory deterministic anomaly engine for validated fixture/parser data, Phase 4B documents future anomaly persistence, and Phase 4C adds anomaly persistence schema readiness plus pure server-side row builders.

This repository currently contains:

- A pnpm workspace with a Next.js App Router web app.
- A static Tailwind dashboard preview with planned MVP modules.
- Shared TypeScript domain types and ingestion envelope contracts in `packages/core`.
- Server-side Supabase fixture ingestion in `packages/ingestion`.
- A pure GitHub Actions workflow-run event adapter for producing ADIA ingestion envelopes.
- A server-side GitHub `workflow_run` webhook route that verifies signatures, supports dry-run envelope mapping, and persists non-dry-run envelope metadata to Supabase.
- Deterministic Terraform plan, Checkov, and anomaly analyzers in `packages/analyzers`, plus a stub for later redaction work.
- Server-only parser persistence and anomaly persistence row builders in `packages/ingestion`, plus fixture-output parser orchestration.
- Vitest tests for analyzer parsing, property-based parser invariants, and ingestion contract validation.
- Supabase schema migrations and seed data for the Phase 1 data model, Phase 2B/2E raw evidence metadata, Phase 3D parser idempotency fields, and Phase 4C anomaly idempotency fields.
- Terraform directory placeholders that create no cloud resources.
- Fixture directories, a validation replay script, and a Supabase-backed fixture ingestion CLI for a demo GitHub Actions deployment run.
- A local parsed-fixture replay CLI that validates the fixture envelope, reads local Terraform/Checkov JSON, runs deterministic parsers, and persists parsed output through server-side code.
- Documentation for product scope, architecture, parser persistence planning, anomaly persistence readiness, decisions, and learning notes.
- Safe starter GitHub Actions workflows for CI and Terraform validation.

Current work intentionally does not include anomaly persistence write orchestration, parser/anomaly API route wiring, automatic webhook parser execution, LLM calls, artifact download, Checkov/Terraform execution, or autonomous remediation. Terraform, Checkov, and anomaly analysis are currently package-level analysis over already-loaded fixture/parser data only, parser persistence is limited to validated local fixture replay or trusted server-side callers, and anomaly persistence is limited to schema readiness plus pure row builders.

## How ADIA Is Different

ADIA is related to a LangChain/Kubernetes orchestration project, but it has a different job.

The LangChain/Kubernetes project focuses on LLM-driven deployment orchestration and Kubernetes execution. ADIA focuses on visibility, risk analysis, CI/CD observability, Terraform plan interpretation, and recommendation quality.

ADIA is not an autonomous deployment executor. It analyzes, explains, and recommends.

## MVP Scope

Planned MVP capabilities:

- Supabase Auth, organizations, projects, and row-level security.
- Deployment run ingestion from GitHub Actions and demo/manual fixtures.
- Terraform plan JSON ingestion from `terraform show -json`.
- Terraform change summaries for creates, updates, deletes, replacements, provider/resource types, IAM changes, networking changes, and public exposure risk.
- Checkov JSON ingestion for IaC scan findings.
- Deterministic anomaly detection before LLM analysis.
- Server-side structured LLM insight generation.
- Evidence-linked recommendations.
- Real-time Tailwind dashboard using Supabase Realtime.
- GitHub Actions workflows for typecheck, lint, tests, build, Terraform validation, and Checkov scanning.

## Non-Goals

- No `terraform apply` from the UI.
- No natural-language infrastructure command execution.
- No autonomous remediation in the MVP.
- No Kubernetes cluster control as the primary product surface.
- No LLM conclusions without linked source evidence.
- No browser exposure of service role keys or LLM API keys.

## Repository Map

```text
apps/web                 Next.js App Router + Tailwind starter dashboard
packages/core            Shared ADIA TypeScript types and ingestion contracts
packages/ingestion       Server-only Supabase fixture ingestion and parser/anomaly persistence helpers
packages/analyzers       Deterministic Terraform, Checkov, and anomaly analyzers plus redaction stub
supabase                 Schema migrations, placeholders, and seed data
infra                    Safe Terraform placeholders for future modules/envs
scripts/fixtures         Sanitized demo ingestion and evidence fixtures
docs                     PRD, architecture, decisions, and learning log
.github/workflows        CI and Terraform starter workflows
```

The GitHub Actions adapter is a pure mapper. The webhook route verifies GitHub signatures before parsing payloads, can return a dry-run envelope, and persists non-dry-run envelope metadata through server-side Supabase code. It does not parse Terraform or Checkov evidence, download GitHub artifacts, call LLMs, or execute infrastructure commands.

## Architecture Summary

Planned pipeline:

```text
GitHub Actions / Terraform / Logs
        |
        v
Ingestion API
        |
        v
Supabase Postgres
        |
        v
Terraform plan parser + IaC scanner parser
        |
        v
Deterministic anomaly engine
        |
        v
LLM insight service
        |
        v
Real-time Tailwind dashboard
```

The important product constraint is that deterministic analysis happens before LLM summarization. LLM output should explain and prioritize evidence, not invent findings or execute remediation.

## Local Development

Prerequisites:

- Node.js 20.9 or newer.
- pnpm 10 or newer.
- Terraform, optional for Phase 0 local validation.

Install dependencies:

```bash
pnpm install
```

Run the web app:

```bash
pnpm dev
```

Run quality checks:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm format
pnpm build
```

Replay the parsed fixture locally into Supabase:

```bash
pnpm replay:parsed-fixture
```

This validates the envelope, upserts deployment and raw evidence metadata, reads local Terraform and Checkov fixture JSON, runs deterministic parsers, and persists parsed evidence rows. It does not execute Terraform, execute Checkov, call LLMs, fetch artifacts, or expose API routes.

Run the Phase 2 fixture ingestion demo:

```bash
pnpm exec tsx scripts/ingest-demo.ts
```

The demo validates one deployment-run fixture and checks that referenced evidence files exist. It does not write to Supabase. See `docs/INGESTION_FIXTURES.md` for details.

Run the analyzer parser and anomaly tests:

```bash
pnpm --filter @adia/analyzers test
```

The analyzers read already-loaded Terraform `show -json`, Checkov JSON, and ADIA parser output values, then return deterministic summaries/findings/anomalies for fixture development. They do not execute Terraform, execute Checkov, read credentials, write to Supabase, or call LLMs.

Phase 3E adds a server-only package function that can persist already-parsed fixture outputs to Supabase when a trusted caller passes existing raw evidence paths. Phase 3F wires that path to local fixture replay only; it is still not wired to an API route or webhook.

Run the Phase 2B Supabase-backed fixture ingestion help command:

```bash
pnpm exec tsx scripts/ingest-fixture-to-supabase.ts --help
```

To write the demo fixture to Supabase, configure server-side Supabase environment variables and run:

```bash
pnpm exec tsx scripts/ingest-fixture-to-supabase.ts
```

This writes `deployment_runs` and `raw_evidence_files` metadata only. It does not parse Terraform, parse Checkov, call LLMs, or execute infrastructure commands.

Run the GitHub workflow-run webhook route in dry-run mode:

```text
POST /api/ingest/github/workflow-run?dryRun=true
```

Required server-side environment:

```bash
GITHUB_WEBHOOK_SECRET=
ADIA_GITHUB_WEBHOOK_ORGANIZATION_SLUG=
ADIA_GITHUB_WEBHOOK_PROJECT_SLUG=
ADIA_GITHUB_WEBHOOK_ENVIRONMENT=
ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON=
```

The route requires GitHub's `X-Hub-Signature-256` header. It verifies the raw body before JSON parsing, maps valid `workflow_run` events into ADIA envelopes, and returns no-write dry-run output when requested.

Without `dryRun=true`, the verified webhook envelope is persisted to Supabase as one `deployment_runs` row and one `raw_evidence_files` row per configured evidence reference. Webhook persistence does not fetch artifacts, so raw evidence file size and hash columns remain empty until a later artifact ingestion phase.

Optional Terraform validation when Terraform is installed:

```bash
terraform -chdir=infra/envs/dev init -backend=false
terraform fmt -check -recursive infra
terraform -chdir=infra/envs/dev validate
```

## Verified Commands

The scaffold and current contract-fixture slice have been verified with:

- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm format`
- `pnpm build`
- `pnpm --filter @adia/analyzers test`
- `pnpm exec tsx scripts/ingest-demo.ts`
- `pnpm exec tsx scripts/ingest-fixture-to-supabase.ts --help`

Browser verification was also performed against the built Next.js app. The landing page and `/dashboard` route rendered with no browser console errors.

## Planned Phases

1. Phase 0 - Repository foundation, docs, starter UI, shared types, stubs, fixtures, and safe CI.
2. Phase 1 - Supabase schema, Auth model, organizations, projects, RLS, and seed data.
3. Phase 2 - Deployment run ingestion from GitHub Actions and fixture-based local ingestion.
4. Phase 3 - Terraform plan parser and Checkov parser with deterministic risk summaries. Phase 3A covers fixture-only Terraform plan parsing, Phase 3B covers fixture-only Checkov parsing, Phase 3C covers parser persistence planning, Phase 3D covers schema readiness plus row builders, Phase 3E covers fixture-only parser persistence orchestration, and Phase 3F covers local parsed-fixture replay.
5. Phase 4 - Anomaly engine and evidence model. Phase 4A covers fixture/parser-data anomaly generation in memory only, Phase 4B covers anomaly persistence planning, and Phase 4C covers anomaly schema readiness plus pure row builders.
6. Phase 5 - Server-side LLM structured insight generation.
7. Phase 6 - Realtime dashboard backed by Supabase.
8. Phase 7 - Optional Playwright E2E coverage, portfolio polish, and deployment hardening.

## Safety Principles

- Deterministic checks run before LLM summaries.
- Recommendations must link back to evidence.
- Secrets stay server-side.
- Fixture-based development comes before real cloud connectivity.
- Analysis and recommendation are separate from execution.
- The UI must not offer destructive infrastructure actions.

## Portfolio Relevance

ADIA is designed to demonstrate full-stack DevOps product thinking:

- Next.js App Router and Tailwind dashboard development.
- Supabase Auth, Postgres, RLS, and Realtime design.
- Terraform and CI/CD observability workflows.
- IaC risk analysis with Checkov-style findings.
- LLM product safety through structured output, evidence grounding, and deterministic pre-checks.
- Professional repo organization, documentation, tests, and automation.
