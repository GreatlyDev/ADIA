# ADIA - Automated Deployment Insight Assistant

ADIA is an AI-assisted DevOps visibility dashboard for understanding deployment risk before it becomes an incident. It is designed to ingest deployment events, Terraform plan JSON, IaC scan output, and logs, then combine deterministic analysis with evidence-grounded LLM summaries.

> ADIA helps DevOps engineers understand deployment risk, Terraform changes, and CI/CD anomalies before they become incidents.

## Current Status

Phase 0 is complete as of June 2, 2026.

This repository currently contains the project foundation only:

- A pnpm workspace with a Next.js App Router web app.
- A static Tailwind dashboard preview with planned MVP modules.
- Shared TypeScript domain types in `packages/core`.
- Analyzer package stubs in `packages/analyzers`.
- One passing Vitest test proving package/test wiring.
- Supabase directory placeholders for future migrations and functions.
- Terraform directory placeholders that create no cloud resources.
- Fixture directories for future GitHub Actions, Terraform plan, Checkov, and log examples.
- Documentation for product scope, architecture, decisions, and learning notes.
- Safe starter GitHub Actions workflows for CI and Terraform validation.

Phase 0 intentionally does not include Supabase business logic, webhook ingestion, Terraform parsing, Checkov parsing, LLM calls, or autonomous remediation.

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
packages/core            Shared ADIA TypeScript types
packages/analyzers       Placeholder parser/anomaly/redaction modules
supabase                 Future migrations, functions, and seed data
infra                    Safe Terraform placeholders for future modules/envs
scripts/fixtures         Future sanitized demo data
docs                     PRD, architecture, decisions, and learning log
.github/workflows        CI and Terraform starter workflows
```

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

Optional Terraform validation when Terraform is installed:

```bash
terraform -chdir=infra/envs/dev init -backend=false
terraform fmt -check -recursive infra
terraform -chdir=infra/envs/dev validate
```

## Verified Phase 0 Commands

The scaffold has been verified with:

- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm format`
- `pnpm build`

Browser verification was also performed against the built Next.js app. The landing page and `/dashboard` route rendered with no browser console errors.

## Planned Phases

1. Phase 0 - Repository foundation, docs, starter UI, shared types, stubs, fixtures, and safe CI.
2. Phase 1 - Supabase schema, Auth model, organizations, projects, RLS, and seed data.
3. Phase 2 - Deployment run ingestion from GitHub Actions and fixture-based local ingestion.
4. Phase 3 - Terraform plan parser and Checkov parser with deterministic risk summaries.
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
