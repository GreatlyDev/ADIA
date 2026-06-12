# ADIA - Automated Deployment Insight Assistant

ADIA is an AI-assisted DevOps visibility dashboard for understanding deployment risk before it becomes an incident. It is designed to ingest deployment events, Terraform plan JSON, IaC scan output, and logs, then combine deterministic analysis with evidence-grounded LLM summaries.

> ADIA helps DevOps engineers understand deployment risk, Terraform changes, and CI/CD anomalies before they become incidents.

## Current Status

Phase 0 and Phase 1 are complete. Phase 2 fixture and GitHub webhook ingestion slices are in place. Phase 3A adds deterministic Terraform plan parsing for sanitized fixture JSON only. Phase 3B adds deterministic Checkov fixture parsing. Phase 3C documents how parser output will be persisted later.

This repository currently contains:

- A pnpm workspace with a Next.js App Router web app.
- A static Tailwind dashboard preview with planned MVP modules.
- Shared TypeScript domain types and ingestion envelope contracts in `packages/core`.
- Server-side Supabase fixture ingestion in `packages/ingestion`.
- A pure GitHub Actions workflow-run event adapter for producing ADIA ingestion envelopes.
- A server-side GitHub `workflow_run` webhook route that verifies signatures, supports dry-run envelope mapping, and persists non-dry-run envelope metadata to Supabase.
- Deterministic Terraform plan and Checkov parsers in `packages/analyzers`, plus stubs for later anomaly and redaction work.
- Vitest tests for analyzer parsing, property-based parser invariants, and ingestion contract validation.
- Supabase schema migrations and seed data for the Phase 1 data model plus Phase 2B/2E raw evidence metadata.
- Terraform directory placeholders that create no cloud resources.
- Fixture directories, a validation replay script, and a Supabase-backed fixture ingestion CLI for a demo GitHub Actions deployment run.
- Documentation for product scope, architecture, parser persistence planning, decisions, and learning notes.
- Safe starter GitHub Actions workflows for CI and Terraform validation.

Current work intentionally does not include implemented parser persistence, LLM calls, artifact download, Checkov/Terraform execution, or autonomous remediation. Terraform and Checkov parsing are currently package-level analysis over already-loaded fixture JSON only.

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
packages/ingestion       Server-only Supabase fixture ingestion
packages/analyzers       Deterministic Terraform and Checkov parsers plus future analyzer stubs
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

Run the Phase 2 fixture ingestion demo:

```bash
pnpm exec tsx scripts/ingest-demo.ts
```

The demo validates one deployment-run fixture and checks that referenced evidence files exist. It does not write to Supabase. See `docs/INGESTION_FIXTURES.md` for details.

Run the analyzer parser tests:

```bash
pnpm --filter @adia/analyzers test
```

The parsers read already-loaded Terraform `show -json` and Checkov JSON values and return deterministic summaries/findings for fixture development. They do not execute Terraform, execute Checkov, read credentials, write to Supabase, or call LLMs.

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
4. Phase 3 - Terraform plan parser and Checkov parser with deterministic risk summaries. Phase 3A covers fixture-only Terraform plan parsing, Phase 3B covers fixture-only Checkov parsing, and Phase 3C covers parser persistence planning.
5. Phase 4 - Anomaly engine and evidence model.
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
