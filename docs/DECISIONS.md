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

## ADR-007: Store Raw Evidence Metadata Before Parsing Evidence

- Status: Accepted
- Context: ADIA needs a trustworthy inventory of deployment evidence before Terraform, Checkov, log parsing, anomaly detection, or LLM insight generation is implemented.
- Decision: Phase 2B stores fixture evidence metadata in `raw_evidence_files` before any semantic parsing is added.
- Consequences: ADIA can track evidence paths, labels, sizes, hashes, and envelope metadata without claiming it has interpreted the evidence yet.

## ADR-008: Keep GitHub Actions Event Mapping Pure Before Webhooks

- Status: Accepted
- Context: GitHub Actions will become an ingestion source, but webhook verification, route handling, and persistence should be developed after the event-to-envelope contract is stable.
- Decision: Phase 2C adds a pure workflow-run event adapter that maps sanitized GitHub data into ADIA ingestion envelopes.
- Consequences: The adapter is easy to test and can later be reused by webhook routes, fixture replay, or GitHub Actions artifact ingestion without mixing transport concerns into mapping logic.

## ADR-009: Verify GitHub Webhook Signatures Before Parsing Payloads

- Status: Accepted
- Context: GitHub webhook bodies are untrusted input. ADIA should not parse or map webhook payloads unless the raw body matches GitHub's HMAC signature.
- Decision: Phase 2D verifies `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET` before JSON parsing and maps only signed `workflow_run` events.
- Consequences: The route can safely support dry-run envelope mapping now, while Supabase persistence and artifact ingestion remain future work.

## ADR-010: Reuse Validated Envelope Persistence For Webhooks

- Status: Accepted
- Context: The GitHub webhook route produces the same ADIA ingestion envelope shape as fixture replay, and the existing Supabase ingestion path already validates envelopes and writes deployment run plus raw evidence metadata rows.
- Decision: Phase 2E persists verified non-dry-run webhook envelopes through the existing server-side Supabase ingestion path.
- Consequences: Webhook persistence stays small and consistent with fixture replay. Artifact download, evidence hashing, parser persistence, and LLM insight generation remain separate future phases.

## ADR-011: Parse Terraform Fixture JSON Before Persistence Or LLM Use

- Status: Accepted
- Context: Terraform plan analysis is central to ADIA, but parser behavior needs to be deterministic and testable before database writes, anomaly detection, or LLM summarization depend on it.
- Decision: Phase 3A implements a pure TypeScript parser over already-loaded sanitized Terraform `show -json` fixture values.
- Consequences: ADIA can validate action counts and risk flags without executing Terraform, reading credentials, writing Supabase records, or calling LLM providers. Persistence and API wiring remain separate future phases.

## ADR-012: Parse Checkov Fixture JSON Before Persistence Or LLM Use

- Status: Accepted
- Context: IaC scan findings are a core ADIA signal, but Checkov parsing needs deterministic status, severity, and evidence-reference behavior before persistence, anomaly detection, or LLM summarization depend on it.
- Decision: Phase 3B implements a pure TypeScript parser over already-loaded sanitized Checkov JSON fixture values.
- Consequences: ADIA can validate failed, passed, skipped, and unknown findings without executing Checkov, reading credentials, writing Supabase records, or calling LLM providers. Persistence and API wiring remain separate future phases.

## ADR-013: Plan Parser Persistence Before Writing Parser Output

- Status: Accepted
- Context: ADIA now has deterministic Terraform and Checkov parsers plus existing Supabase evidence tables, but replay safety, tenant boundaries, and evidence links need a clear design before database writes are added.
- Decision: Phase 3C documents parser persistence before implementation. Future writes should run server-side, re-check run and raw evidence ownership, use idempotent upserts backed by unique indexes, and link every persisted parser output to source evidence.
- Consequences: Parser output remains in memory for now. A later implementation phase can add migrations and server-only persistence with fewer surprises around RLS, duplicate rows, and evidence traceability.

## ADR-014: Add Parser Idempotency Schema Before Runtime Writes

- Status: Accepted
- Context: Parser output needs stable conflict keys and evidence references before ADIA can safely replay fixture or webhook processing jobs.
- Decision: Phase 3D adds parser source evidence fields, parser versions, deterministic fingerprints, IaC evidence refs, source-evidence consistency triggers, and duplicate-safe evidence-link labels before runtime parser persistence is wired.
- Consequences: Future persistence can use upsert-style row writes without duplicating parser output. The application still does not write Terraform or Checkov parser output to Supabase at runtime.

## ADR-015: Persist Parsed Fixture Output Before API Wiring

- Status: Accepted
- Context: ADIA needs to prove parser persistence can replay safely before routes, webhook workers, or artifact ingestion call it automatically.
- Decision: Phase 3E adds a server-side orchestration function that persists already-parsed fixture Terraform and Checkov output through existing `raw_evidence_files` rows and Phase 3D row builders.
- Consequences: Parser persistence can now be tested end to end at the package level. External API surfaces, automatic webhook parser execution, artifact download, anomaly detection, and LLM insight generation remain separate future phases.

## ADR-016: Use Local Fixture Replay Before Parser API Wiring

- Status: Accepted
- Context: ADIA needs a safe way to demo parser persistence against local fixtures before accepting parser writes through routes, webhooks, or workers.
- Decision: Phase 3F adds a local server-side replay CLI that validates an existing envelope, reads local Terraform and Checkov JSON fixtures, runs deterministic parsers, and persists output through Phase 3E orchestration.
- Consequences: Portfolio demos can exercise the parser persistence path end to end without cloud execution or LLM calls. Production-style API or worker wiring remains future work.

## ADR-017: Generate Anomalies Deterministically Before Persistence

- Status: Accepted
- Context: ADIA needs repeatable anomaly signals before LLM insight generation, dashboard wiring, or database persistence depends on them.
- Decision: Phase 4A adds a pure TypeScript anomaly engine that accepts validated deployment run, Terraform parser, and Checkov parser data and returns in-memory `Anomaly` objects with evidence references.
- Consequences: Anomaly logic can be tested and refined without API routes, Supabase writes, LLM calls, or infrastructure execution. Persisting anomalies and linking them to dashboard/API flows remain future phases.

## ADR-018: Plan Anomaly Persistence Before Writing Anomalies

- Status: Accepted
- Context: ADIA now has deterministic anomaly objects, but persistence needs replay safety, evidence-link mapping, and RLS-safe server boundaries before writes are added.
- Decision: Phase 4B documents anomaly persistence before implementation. Future writes should add deterministic fingerprints, evidence ref storage, duplicate-safe upserts, evidence links, explicit scope checks, and server-only callers.
- Consequences: Anomalies remain in memory for now. A future phase can implement persistence with fewer surprises around tenant safety, duplicate rows, and evidence traceability.

## ADR-019: Prepare Anomaly Persistence Schema Before Write Orchestration

- Status: Accepted
- Context: ADIA needs replay-safe anomaly writes, but database shape and mapping rules should be testable before adding Supabase upserts or route/worker execution.
- Decision: Phase 4C adds anomaly engine version, fingerprint, evidence ref, and metadata schema readiness plus pure server-side row builders before implementing a persistence orchestration function.
- Consequences: Future anomaly persistence can use deterministic conflict keys and evidence links without duplicating rows. ADIA still does not write anomalies to Supabase, expose anomaly routes, call LLMs, or execute infrastructure commands.

## ADR-020: Persist Anomalies From Scoped Parser Rows Before Runtime Wiring

- Status: Accepted
- Context: ADIA needs to prove anomaly persistence is replay-safe and evidence-grounded before webhooks, routes, dashboard flows, or LLM insights depend on it.
- Decision: Phase 4D adds a trusted server-side package function that reads one scoped deployment run plus already-persisted parser rows, runs deterministic anomaly detection with persisted evidence IDs, verifies evidence refs, and upserts anomalies plus evidence links.
- Consequences: Anomaly persistence can now be tested at the package level without exposing a runtime API. Automatic webhook processing, dashboard reads, LLM insight generation, and infrastructure execution remain separate future phases.

## ADR-021: Add Anomaly Persistence To Local Fixture Replay Before Runtime Automation

- Status: Accepted
- Context: ADIA needs an end-to-end local demo path for parser and anomaly persistence before webhook workers, API routes, or dashboard flows call the pipeline automatically.
- Decision: Phase 4E extends local parsed-fixture replay to call Phase 4D anomaly persistence after parser persistence succeeds and to report anomaly plus evidence-link counts.
- Consequences: Portfolio demos can replay raw evidence, parser output, and anomalies through trusted server-side code. Production-style automation, LLM insight generation, and infrastructure execution remain out of scope.

## ADR-022: Plan Anomaly Read Model Before Dashboard/API Wiring

- Status: Accepted
- Context: ADIA now has persisted deterministic anomalies in local fixture replay, but dashboard and API reads need clear RLS-safe contracts before UI or route implementation.
- Decision: Phase 4F documents the future anomaly feed, run panel, detail drawer, evidence drill-down, filters, Realtime scope, and tests before adding runtime dashboard/API code.
- Consequences: Future dashboard work can use authenticated Supabase reads with explicit organization/run scope and allowlisted evidence resolution. Service-role dashboard reads, broad Realtime subscriptions, LLM calls, and infrastructure execution stay out of this phase.
