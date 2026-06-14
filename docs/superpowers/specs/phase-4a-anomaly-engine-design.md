# Phase 4A Anomaly Engine Design

## Goal

Add a deterministic anomaly engine for validated fixture/parser data only. The engine turns deployment run metadata, Terraform plan summaries/resource changes, and Checkov findings into in-memory ADIA `Anomaly` objects with evidence references.

## Scope

Phase 4A includes:

- A pure TypeScript anomaly engine in `packages/analyzers`.
- Deterministic rules over already-loaded ADIA domain objects.
- Stable anomaly IDs, categories, severities, summaries, and evidence refs.
- Example and property-based Vitest coverage.
- Documentation updates showing anomaly detection is available in memory only.

Phase 4A does not include:

- Supabase anomaly persistence.
- API routes, webhook workers, or dashboard wiring.
- LLM calls.
- Terraform, Checkov, cloud, or shell execution.

## Rule Set

The first anomaly rules are intentionally small and explainable:

- Failed or canceled deployment run status.
- Long deployment duration based on `durationSeconds`.
- Public exposure in Terraform resource changes.
- High destructive/replacement Terraform blast radius.
- Failed high or critical IaC scan findings.
- Elevated count of failed IaC scan findings.

Rules only use provided validated data. The engine does not read files, fetch artifacts, create clients, or use wall-clock time unless the caller passes an explicit `detectedAt` value.

## Evidence References

Evidence refs are string references that name the source record:

- `deployment_runs:<id>`
- `terraform_plans:<id>`
- `terraform_resource_changes:<id>`
- `iac_scan_findings:<id>`

Future persistence can convert these strings into `evidence_links` rows, but Phase 4A keeps output in memory.

## Data Flow

```text
DeploymentRun + parser output
        |
        v
deterministic anomaly rules
        |
        v
Anomaly[]
```

The output is suitable for future persistence, LLM insight prompting, and dashboard rendering, but no runtime integration is added in this phase.
