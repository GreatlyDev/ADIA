# Phase 4D Anomaly Persistence Orchestration Design

## Objective

Add server-side anomaly persistence orchestration for validated fixture/parser data only.

This phase adds a trusted package-level function that:

- Resolves one deployment run by organization and run ID.
- Reads already-persisted Terraform and Checkov parser rows for that run.
- Maps persisted parser rows into Phase 4A analyzer input.
- Runs the deterministic anomaly engine.
- Verifies every anomaly evidence ref resolves to an already-scoped evidence row.
- Upserts replay-safe anomaly rows.
- Upserts supporting `evidence_links` rows.

This phase does not expose API routes, call LLMs, execute Terraform, execute Checkov, fetch artifacts, run cloud commands, or add dashboard wiring.

## Server Boundary

The orchestration belongs in `packages/ingestion` because it coordinates database persistence. It must remain server-only.

The function accepts a Supabase-like server client and explicit scope:

```ts
persistFixtureAnomalies(client, {
  organizationId,
  deploymentRunId,
});
```

The caller is responsible for using this only after validated fixture ingestion and parser persistence have already run.

## Evidence Model

The anomaly engine must receive persisted database IDs, not parser-local fixture IDs, so evidence links can reference actual rows.

The orchestrator resolves:

- `deployment_runs:<deployment_run_id>`
- `terraform_plans:<terraform_plan_id>`
- `terraform_resource_changes:<terraform_resource_change_id>`
- `iac_scan_findings:<iac_scan_finding_id>`

Generated anomaly evidence refs must be a subset of the resolved evidence refs. If not, the function fails closed before writing anomalies.

## Replay Behavior

Replay safety comes from Phase 4C:

- Anomalies upsert by `deployment_run_id, anomaly_engine_version, fingerprint`.
- Evidence links upsert by `organization_id, source_table, source_id, target_table, target_id, label`.

Replaying the same fixture/parser state should not duplicate anomaly rows or evidence link rows.

## Scope Checks

The function filters every read by `organization_id` and `deployment_run_id`.

It also verifies:

- The deployment run exists in the requested organization.
- Terraform resource changes belong to the selected Terraform plan.
- Anomaly row builders reject mismatched anomaly organization/run IDs.
- Evidence links are only created for resolved source evidence rows.

## Tests

Tests should cover:

- Writing anomalies and evidence links from persisted parser rows.
- Replaying without duplicate anomalies or evidence links.
- Returning no writes when no anomaly rules match.
- Rejecting missing deployment runs before writes.
- Rejecting ambiguous multiple Terraform plan rows in fixture scope.
