# Phase 3B Checkov Parser Design

## Goal

Phase 3B adds deterministic parsing for sanitized Checkov JSON fixture data.

The parser converts Checkov result arrays into ADIA `IacScanFinding` values that later phases can persist, display, and use as evidence for deterministic anomaly detection.

## Scope

This phase includes:

- Parse in-memory Checkov JSON objects from fixture files.
- Normalize `failed_checks`, `passed_checks`, `skipped_checks`, and optional `unknown_checks`.
- Normalize Checkov severities into ADIA `Severity` values.
- Preserve check ID, title, resource, file path, guideline, scanner, organization, deployment run, and status.
- Generate deterministic finding IDs and JSON-location evidence references.
- Keep output deterministic for repeatable tests and demos.

This phase does not:

- Execute Checkov.
- Execute Terraform or cloud commands.
- Read cloud credentials.
- Write parser output to Supabase.
- Parse Terraform plans.
- Detect anomalies.
- Call LLM providers.
- Remediate infrastructure.

## Input Contract

`parseIacScanFindings` accepts:

- `organizationId`
- `deploymentRunId`
- `scanner: "checkov"`
- `scan`

The parser works over already-loaded JSON values. It does not read files or shell out.

## Status Mapping

Checkov result arrays map to ADIA statuses:

- `results.failed_checks[]` -> `failed`
- `results.passed_checks[]` -> `passed`
- `results.skipped_checks[]` -> `skipped`
- `results.unknown_checks[]` -> `unknown`

If an expected array is missing or invalid, it contributes no findings.

## Severity Mapping

Severity normalization is case-insensitive:

- `CRITICAL` -> `critical`
- `HIGH` -> `high`
- `MEDIUM` -> `medium`
- `LOW` -> `low`
- `INFO` or missing/unknown values -> `info`

Passed, skipped, and unknown checks often omit severity. Missing severity is normalized to `info`.

## Evidence References

Each finding includes a JSON-location evidence reference:

```text
results.failed_checks[0]
```

This keeps findings grounded to the source Checkov JSON without requiring database rows or artifact fetching in this phase.

## Safety

The parser is pure TypeScript. It must not import `child_process`, shell out, read credentials, create Supabase clients, call LLMs, or mutate infrastructure.
