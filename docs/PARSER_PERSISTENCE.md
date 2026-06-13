# Parser Persistence Plan

## Scope

Phase 3C defined how parsed Terraform and Checkov fixture output should be written to Supabase in a future phase. Phase 3D adds schema readiness and server-only row builders, but still does not write parser output at runtime.

Current work does not add parser write orchestration, API routes, LLM calls, Terraform execution, Checkov execution, artifact download, or cloud commands.

## Current Inputs

Future parser persistence will start from data ADIA already has:

- A validated ingestion envelope.
- One `deployment_runs` row.
- One or more `raw_evidence_files` rows for Terraform plan JSON, Checkov JSON, and logs.
- In-memory parser output from `packages/analyzers`.

The existing parsers are pure functions. They receive already-loaded JSON values and return ADIA domain types. They do not read files, fetch artifacts, write to Supabase, call LLMs, or run infrastructure tools. Phase 3D row builders only transform parser output into database row shapes; they do not perform Supabase writes.

## Future Server Boundary

Parser persistence orchestration should live in server-only code, most likely `packages/ingestion`, behind a future function shaped like:

```ts
persistParsedEvidenceForRun({
  client,
  organizationId,
  deploymentRunId,
  terraformPlan,
  terraformSourceEvidenceFileId,
  iacFindings,
  iacSourceEvidenceFileId,
  parserVersion,
});
```

Callers may be a trusted CLI, a Next.js route handler, a background worker, or a future webhook processing job. Browser code must never call this boundary directly and must never receive `SUPABASE_SERVICE_ROLE_KEY`, LLM keys, or other server secrets.

`packages/analyzers` should remain persistence-free. Its job is deterministic parsing only.

## Future Write Flow

The future write sequence should be:

1. Resolve the `deployment_runs` row by `deploymentRunId`.
2. Resolve source `raw_evidence_files` rows for the Terraform plan and Checkov scan.
3. Verify every source row belongs to the same `organization_id` and `deployment_run_id`.
4. Parse already-loaded fixture or artifact JSON in memory.
5. Persist Terraform plan summary to `terraform_plans`.
6. Persist Terraform resource changes to `terraform_resource_changes`.
7. Persist Checkov findings to `iac_scan_findings`.
8. Persist traceability rows to `evidence_links`.
9. Return persisted row IDs and counts for logs, API responses, and tests.

The parser persistence layer should treat the database as the source of tenant truth. The caller may pass IDs, but the persistence function must re-read the deployment run and raw evidence rows before writing.

## Terraform Plan Writes

`TerraformPlanSummary` maps to `terraform_plans`:

- `organization_id` from the deployment run.
- `deployment_run_id` from the deployment run.
- `summary` as a compact JSON object with parser version, source evidence path, source content hash when available, and normalized counts.
- `create_count`, `update_count`, `delete_count`, `replacement_count`, `risky_resource_count`, `iam_change_count`, `networking_change_count`, and `public_exposure_count` from the parser summary.
- `raw_plan` should stay `{}` unless a future phase explicitly adds redacted raw plan storage. Terraform plan JSON can contain sensitive values, so raw storage must be an intentional decision.

`TerraformResourceChange` maps to `terraform_resource_changes`:

- `organization_id`, `deployment_run_id`, and `terraform_plan_id` from the persisted plan.
- `address`, `type`, `name`, `actions`, `provider_name`, `module_address`, `risk_flags`, `evidence_path`, and `change_summary` from parser output.

The current parser uses evidence paths such as `resource_changes[0]`. Future persistence should preserve those paths because they let the UI and LLM pipeline point back to the exact JSON location that produced a change record.

## Checkov Finding Writes

`IacScanFinding` maps to `iac_scan_findings`:

- `organization_id` and `deployment_run_id` from the deployment run.
- `scanner`, `status`, `severity`, `check_id`, `title`, `resource`, `file_path`, and `guideline` from parser output.
- `raw_finding` should stay compact and redacted. It may include parser version, source evidence path, normalized evidence refs, and selected scanner metadata.

Schema gap to address before implementation: `IacScanFinding` has `evidenceRefs`, but `iac_scan_findings` does not yet have a first-class `evidence_refs` column. The future migration should add `evidence_refs text[] not null default '{}'` so parsed evidence references do not have to be hidden inside `raw_finding`.

## Idempotency Plan

Parser persistence must be safe to replay. Re-running the same fixture or webhook processing job should update existing rows instead of duplicating parser output.

Phase 3D adds these migration pieces:

- `source_evidence_file_id uuid` on `terraform_plans` and `iac_scan_findings`, referencing `raw_evidence_files(id)`.
- `parser_version text not null` on parser-owned tables.
- `source_content_sha256 text` where useful for detecting source changes.
- `fingerprint text` on `terraform_resource_changes` and `iac_scan_findings`.
- A unique index on `terraform_plans (deployment_run_id, source_evidence_file_id, parser_version)`.
- A unique index on `terraform_resource_changes (terraform_plan_id, fingerprint)`.
- A unique index on `iac_scan_findings (deployment_run_id, source_evidence_file_id, scanner, fingerprint)`.
- A non-null evidence link label with a unique index on `(organization_id, source_table, source_id, target_table, target_id, label)`.

Recommended fingerprints:

- Terraform resource change: stable hash of `parserVersion`, `terraformPlanId`, `address`, `actions`, and `evidencePath`.
- Checkov finding: stable hash of `parserVersion`, `scanner`, `status`, `checkId`, `resource`, `filePath`, `title`, and joined `evidenceRefs`.

Future writes should use upserts with `ON CONFLICT` rather than select-then-insert checks. If the source evidence content hash changes for the same run and path, the plan row should update counts and metadata, and child rows should be upserted by fingerprint. A later cleanup step can mark missing children as stale if ADIA needs historical parser revisions.

## Transaction And Consistency Plan

The ideal future implementation writes parent rows, child rows, and evidence links in one database transaction. Supabase JS does not provide arbitrary multi-statement transactions through normal table calls, so the implementation should choose one of these patterns:

- A server-only direct Postgres transaction if ADIA introduces a Postgres driver.
- A carefully designed Supabase RPC using `security invoker`, normal RLS, and explicit tenant checks.
- Idempotent ordered upserts as an initial fallback, with retry safety and no destructive deletes.

Do not add a `security definer` parser persistence function in an exposed schema. If any privileged database function is added later, it should live outside exposed schemas and be reviewed separately.

Existing consistency triggers already reject cross-organization relationships for deployment runs, Terraform plans, Terraform resource changes, IaC findings, and evidence links. Future persistence code should still validate relationships before writes so failures are clear before the database backstop fires.

## RLS-Safe Access Model

Future parser persistence has two safe caller modes:

- Trusted server job mode: use a service-role client only from server code, verify organization/run/evidence ownership explicitly, and keep all secrets outside `NEXT_PUBLIC_` variables.
- User-initiated mode: use an authenticated Supabase client with an access token for an owner or admin. Existing RLS policies allow admins to write evidence tables and members to read them.

The dashboard should only read persisted parser output through normal RLS-protected queries. It should never receive service-role credentials, parser write endpoints, or raw secret-bearing evidence.

## Evidence Link Plan

Evidence links should make every parser output explainable:

- `raw_evidence_files` -> `terraform_plans` with label `parsed_from`.
- `terraform_plans` -> `terraform_resource_changes` with label `contains_change`.
- `raw_evidence_files` -> `iac_scan_findings` with label `reported_by`.
- Future correlation may link `terraform_resource_changes` -> `iac_scan_findings` with label `resource_match`.

Evidence link metadata should stay small:

- Parser version.
- Source evidence path.
- Source content hash when available.
- Evidence ref such as `resource_changes[0]` or `results.failed_checks[2]`.

Evidence link metadata should not store secrets, complete raw logs, or full unredacted Terraform plan content.

## Test Plan

Future parser persistence should include tests before implementation is considered complete:

- Unit tests for mapping `TerraformPlanSummary` into `terraform_plans` and `terraform_resource_changes` write rows.
- Unit tests for mapping `IacScanFinding` into `iac_scan_findings` write rows.
- Idempotency tests that persist the same parser output twice and verify one plan row, stable child rows, and no duplicate evidence links.
- Tenant safety tests that reject mismatched `organization_id`, `deployment_run_id`, or source evidence IDs.
- Evidence link tests that verify source table, target table, labels, metadata, and no cross-organization links.
- Failure tests that simulate parent write failure, child write failure, and evidence-link write failure.
- Static safety tests or review checks confirming parser persistence does not call LLMs, execute infrastructure tools, spawn shell commands, or expose server secrets to browser code.

Property-based tests can later exercise parser-output replay behavior by generating varied resource changes and findings, then asserting stable fingerprints and duplicate-free writes.

## Implementation Readiness Checklist

Before implementing runtime parser persistence, ADIA should still add:

- A clear decision on raw Terraform plan storage versus redacted summary-only storage.
- A server-only write orchestration module in `packages/ingestion`.
- Tests for row mapping, replay idempotency, tenant checks, and evidence links.
- Documentation updates showing that parser output is now persisted.

The parser idempotency migration and row-mapping tests are now present. Until write orchestration is implemented, parser output remains in memory only.
