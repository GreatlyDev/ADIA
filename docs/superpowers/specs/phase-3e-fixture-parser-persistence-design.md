# Phase 3E Fixture Parser Persistence Design

## Goal

Persist already-parsed fixture evidence to Supabase from server-side code, using existing `raw_evidence_files` rows and Phase 3D row builders.

## Scope

Phase 3E includes:

- A server-only orchestration function in `packages/ingestion`.
- Raw evidence lookup by organization, deployment run, evidence kind, format, and path.
- Upserts for Terraform plan summaries, Terraform resource changes, Checkov findings, and evidence links.
- Replay-safe behavior through Phase 3D conflict keys.
- Tests with a fake Supabase client.

Phase 3E does not include:

- API routes.
- Webhook parser execution.
- CLI parser execution.
- Artifact download.
- LLM calls.
- Terraform, Checkov, or cloud command execution.

## Persistence Flow

```text
validated fixture parser output
        |
        v
resolve raw_evidence_files
        |
        v
Phase 3D row builders
        |
        v
Supabase upsert calls
        |
        v
evidence_links
```

The orchestration function accepts parser outputs and source evidence paths. It never reads fixture files or runs parsers itself.

## Safety Boundary

This function is intended for trusted server-side callers only. Future phases may wrap it in a CLI, route, or worker, but those wrappers must keep service credentials server-side and must continue to verify tenant/run/source evidence scope before writes.
