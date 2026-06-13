# Phase 3D Parser Persistence Schema Design

## Goal

Prepare ADIA for future parser persistence by adding replay-safe schema fields, deterministic row-mapping helpers, and tests without writing parser output to Supabase at runtime.

## Scope

Phase 3D includes:

- A Supabase migration for parser source evidence references, parser versions, fingerprints, IaC evidence refs, and duplicate-safe evidence links.
- Server-only TypeScript row builders in `packages/ingestion`.
- Tests proving deterministic row mapping and fingerprint stability.

Phase 3D does not include:

- Supabase write orchestration for parser output.
- API route wiring.
- GitHub artifact download.
- LLM calls.
- Terraform, Checkov, or cloud command execution.

## Design Notes

Parser output tables need stable conflict keys before runtime writes are safe. The migration adds nullable source evidence fields so existing seeded rows remain valid, while future parsed rows can include source evidence IDs and deterministic fingerprints.

The row builders produce snake-case database rows and conflict-target constants. They do not create Supabase clients or call `.insert`, `.upsert`, or `.rpc`.

Evidence links now require a non-empty label so future duplicate prevention can use a regular composite unique index instead of an expression index that would be awkward to target with standard upsert calls.

## Safety Boundaries

- `packages/analyzers` remains pure parsing code.
- `packages/ingestion` gains row-mapping helpers only.
- Browser code still has no parser write surface.
- Service-role credentials stay server-side.
- Runtime parser persistence remains a future phase.
