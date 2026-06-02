# Architectural Decision Log

This file records important technical and product decisions for ADIA. New decisions should include context, decision, status, and consequences.

## ADR-001: Use Next.js App Router

- Status: Accepted
- Context: ADIA needs a modern TypeScript dashboard with server-side routes available for future ingestion and insight generation.
- Decision: Use Next.js App Router for the web application.
- Consequences: The project can colocate route UI and future API route handlers while keeping server-only logic out of browser bundles.

## ADR-002: Use Supabase for Auth, Postgres, RLS, and Realtime

- Status: Accepted
- Context: ADIA needs authenticated multi-tenant data, relational records, row-level security, and realtime dashboard updates.
- Decision: Use Supabase as the backend platform.
- Consequences: Phase 1 must carefully design organizations, projects, membership, and RLS before real ingestion is enabled.

## ADR-003: Use Deterministic Anomaly Rules Before LLM Summarization

- Status: Accepted
- Context: LLMs are useful for summarization, but deployment risk detection must be repeatable and evidence-grounded.
- Decision: Run deterministic analysis before LLM insight generation.
- Consequences: LLM output will explain and prioritize evidence rather than invent primary findings.

## ADR-004: Do Not Allow Automatic Terraform Apply in the MVP

- Status: Accepted
- Context: ADIA is a visibility and insight product, not an autonomous infrastructure executor.
- Decision: The MVP will not run `terraform apply` from the UI.
- Consequences: Recommendations remain advisory. Execution remains in existing human-reviewed DevOps workflows.

## ADR-005: Use Fixture-Based Development Before Real Cloud Accounts

- Status: Accepted
- Context: Early development should be safe, reproducible, and portfolio-friendly.
- Decision: Build ingestion, parsing, and UI flows against fixtures before connecting real cloud accounts.
- Consequences: The project can test behavior without credentials, cloud spend, or accidental infrastructure changes.

## ADR-006: Keep ADIA Distinct From the LangChain/Kubernetes Orchestration Project

- Status: Accepted
- Context: The related LangChain/Kubernetes project handles orchestration and execution. ADIA should show different product judgment.
- Decision: ADIA focuses on visibility, risk detection, CI/CD observability, and evidence-grounded insight.
- Consequences: Kubernetes control and autonomous remediation stay out of ADIA's core MVP.
