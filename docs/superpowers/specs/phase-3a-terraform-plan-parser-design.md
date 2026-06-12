# Phase 3A Terraform Plan Parser Design

## Goal

Phase 3A adds deterministic parsing for sanitized Terraform `show -json` fixture data.

The parser converts Terraform resource changes into ADIA `TerraformPlanSummary` and `TerraformResourceChange` values that later phases can persist, display, and use as evidence for anomaly detection.

## Scope

This phase includes:

- Parse in-memory Terraform plan JSON objects from fixture files.
- Count simple creates, updates, deletes, and replacements.
- Preserve resource address, type, name, provider, module address, and actions.
- Identify IAM-related changes.
- Identify networking-related changes.
- Identify public exposure indicators.
- Mark risky resource changes with evidence-oriented risk flags.
- Keep output deterministic for repeatable tests and demos.

This phase does not:

- Execute Terraform commands.
- Read cloud credentials.
- Write parser output to Supabase.
- Parse Checkov output.
- Detect cross-run anomalies.
- Call LLM providers.
- Remediate or apply infrastructure changes.

## Counting Semantics

`terraform show -json` resource changes include `change.actions`.

ADIA treats actions as:

- `["create"]`: one create.
- `["update"]`: one update.
- `["delete"]`: one delete.
- `["delete", "create"]` or `["create", "delete"]`: one replacement.
- `["no-op"]`: no count and no emitted resource change.
- Any action list containing both create and delete: one replacement.

Replacement resources are not double-counted as simple creates or deletes.

## Risk Signals

Risk flags are deterministic and conservative:

- `iam_change`: resource type or address indicates IAM or policy management.
- `networking_change`: resource type or address indicates security groups, firewalls, routes, VPCs, subnets, load balancers, listeners, gateways, or ACLs.
- `public_exposure`: resource values indicate public CIDR ranges, public accessibility, disabled public-access blocks, or permissive public policies.

`riskyResourceCount` counts unique resource changes with at least one risk flag.

## Evidence Paths

Each emitted resource change uses an evidence path pointing to the Terraform JSON location:

```text
resource_changes[index]
```

This keeps the summary evidence-grounded without requiring a database row or external artifact fetch in this phase.

## Safety

The parser is pure TypeScript. It accepts an already-loaded JSON value and returns a summary. It must not import `child_process`, shell out, read credentials, create Supabase clients, call LLMs, or mutate infrastructure.
