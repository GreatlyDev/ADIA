# Phase 3F Fixture Replay CLI Design

## Goal

Add a local server-side CLI that replays a validated fixture envelope, reads local Terraform and Checkov JSON fixtures, runs deterministic parsers, and persists parser output through Phase 3E orchestration.

## Scope

Phase 3F includes:

- A package-level replay function in `packages/ingestion`.
- A local CLI script in `scripts/`.
- Root script wiring for convenient execution.
- Tests around fixture validation, local evidence reading, parser execution, and persistence delegation.

Phase 3F does not include:

- API routes.
- Webhook parser execution.
- GitHub artifact download.
- LLM calls.
- Terraform, Checkov, or cloud command execution.

## Flow

```text
fixture envelope
        |
        v
validate envelope + raw evidence paths
        |
        v
upsert deployment_runs + raw_evidence_files
        |
        v
read Terraform and Checkov fixture JSON
        |
        v
run deterministic parsers
        |
        v
Phase 3E persistence orchestration
```

The CLI is intended for local demo replay and portfolio verification. It is not a production webhook processor.
