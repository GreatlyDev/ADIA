# ADIA Product Requirements Document

## Product Overview

ADIA - Automated Deployment Insight Assistant - is a deployment visibility product for DevOps engineers. It helps teams understand deployment health, Terraform plan risk, IaC scan findings, CI/CD anomalies, and recommendation evidence from one dashboard.

ADIA analyzes and explains. It does not execute deployments or remediate infrastructure autonomously.

## Problem Statement

Deployment systems produce useful signals across CI logs, Terraform plans, IaC scanners, and runtime logs, but those signals are fragmented. Engineers often discover risk late, after a failed deployment or incident. ADIA gives teams a structured, evidence-grounded way to review deployment risk before changes reach production.

## Target Users

- DevOps engineers reviewing deployment safety.
- Platform engineers maintaining CI/CD pipelines.
- SREs monitoring change risk and incident precursors.
- Engineering managers who need high-level deployment health visibility.
- Portfolio reviewers evaluating practical DevOps and AI engineering ability.

## MVP Features

- Supabase Auth with organizations, projects, and RLS.
- Deployment runs with status, commit metadata, environment, and timestamps.
- Ingestion from GitHub Actions and demo fixtures.
- Terraform plan JSON ingestion from `terraform show -json`.
- Terraform summary extraction for creates, updates, deletes, replacements, resource types, IAM changes, networking changes, and exposure risk.
- Checkov JSON ingestion for IaC scan findings.
- Deterministic anomaly detection before LLM analysis.
- Server-side LLM insight generation with structured JSON output.
- Evidence-linked recommendations.
- Realtime Tailwind dashboard.
- CI workflows for typecheck, lint, tests, build, Terraform validation, and Checkov scanning.

## Non-Goals

- No automatic `terraform apply`.
- No UI-driven infrastructure mutation.
- No natural-language command executor.
- No autonomous remediation in the MVP.
- No Kubernetes cluster control as the central product surface.
- No LLM insight without evidence references.
- No client-side service role keys or LLM credentials.

## Data Model Overview

Planned entities:

- `organizations` - tenant boundary for teams.
- `organization_members` - user membership and roles.
- `projects` - deployment visibility scope.
- `deployment_runs` - CI/CD run metadata and status.
- `terraform_plans` - raw and summarized Terraform plan data.
- `terraform_resource_changes` - resource-level change records.
- `iac_scan_findings` - Checkov or future scanner findings.
- `anomalies` - deterministic analysis output.
- `insights` - structured server-side LLM summaries.
- `recommendations` - evidence-linked follow-up actions.
- `evidence_links` - references to logs, plan paths, scan findings, commits, or run IDs.

The base schema was implemented in Phase 1. Current ingestion work writes deployment runs and raw evidence metadata. Phase 3A can summarize Terraform plan fixture JSON in memory, and Phase 3B can normalize Checkov fixture JSON in memory. Phase 3C documents parser persistence, Phase 3D adds schema readiness plus row builders, Phase 3E adds fixture-only parser persistence orchestration, Phase 3F adds a local parsed-fixture replay CLI, Phase 4A can generate deterministic anomalies in memory from validated fixture/parser data, Phase 4B documents future anomaly persistence, and Phase 4C adds anomaly persistence schema readiness plus pure row builders. API/worker wiring, anomaly persistence write orchestration, insight, and recommendation writes remain planned for future phases.

## API Roadmap

Planned API surface:

- `POST /api/ingest/github/workflow-run` for signed GitHub workflow-run webhook ingestion.
- `POST /api/ingest/deployment-run` for CI/CD run ingestion.
- `POST /api/ingest/terraform-plan` for Terraform plan JSON.
- `POST /api/ingest/checkov` for IaC scan findings.
- `POST /api/ingest/logs` for deployment log snippets.
- `POST /api/analyze/run/:id` for deterministic analysis.
- `POST /api/insights/run/:id` for server-side LLM insight generation.
- `GET /api/projects/:id/runs` for dashboard data.

Current work implements the signed GitHub workflow-run webhook route plus package-level Terraform, Checkov, and anomaly analyzers for trusted development use only. Phase 3F adds local parsed-fixture replay. The parsers and anomaly engine are not exposed as API routes yet. The other API routes remain roadmap items.

## Dashboard Roadmap

Planned dashboard surfaces:

- Deployment run list and status timeline.
- Terraform risk summary.
- Resource change breakdown.
- Checkov finding summary.
- Anomaly feed.
- AI insight panel with cited evidence.
- Recommendation queue.
- Project and environment filters.
- Realtime run updates via Supabase Realtime.

The dashboard currently remains a static placeholder UI.

## AI Safety Principles

- Run deterministic anomaly rules before invoking an LLM.
- Redact secrets before LLM analysis.
- Use server-side LLM calls only.
- Request structured JSON output.
- Validate LLM output before storing.
- Link every recommendation to evidence.
- Keep analysis separate from execution.
- Never offer destructive infrastructure actions from the MVP UI.

## Phase Breakdown

- Phase 0: Repo foundation and static starter app.
- Phase 1: Supabase schema, Auth, RLS, and seed data.
- Phase 2: Fixture ingestion, GitHub Actions ingestion contract, signed workflow-run webhook mapping, and metadata persistence.
- Phase 3A: Fixture-only Terraform plan parser.
- Phase 3B: Fixture-only Checkov parser.
- Phase 3C: Parser persistence planning.
- Phase 3D: Parser persistence schema readiness and row builders.
- Phase 3E: Fixture-only parser persistence orchestration.
- Phase 3F: Local parsed-fixture replay CLI.
- Phase 4A: Deterministic anomaly engine over validated fixture/parser data.
- Phase 4B: Anomaly persistence planning.
- Phase 4C: Anomaly persistence schema readiness and pure row builders.
- Phase 5: LLM insight service.
- Phase 6: Realtime dashboard integration.
- Phase 7: E2E tests, deployment, and portfolio polish.

## Definition of Done

Phase 0 was complete when:

- The repository structure exists.
- The starter Next.js app runs with static placeholder data.
- Root scripts exist for dev, build, typecheck, test, lint, and format.
- Shared TypeScript types exist.
- Analyzer stubs exist.
- At least one Vitest test exists and passes.
- Documentation explains product scope, architecture, decisions, and learning flow.
- No secrets are committed.
- No real cloud resources are created.
- No Supabase business logic, webhook ingestion, Terraform parsing, or LLM integration was implemented in that foundation phase.
