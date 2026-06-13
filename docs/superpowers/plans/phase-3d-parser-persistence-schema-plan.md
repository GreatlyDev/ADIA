# Phase 3D Parser Persistence Schema Plan

## Objective

Add schema readiness and tested row builders for future parser persistence without wiring runtime writes.

## Tasks

1. Write a failing ingestion package test for Terraform plan row mapping, resource change fingerprints, Checkov finding rows, and evidence-link rows.
2. Implement the minimal `parserPersistence` row-builder module in `packages/ingestion`.
3. Export the row builders from the ingestion package.
4. Add a date-free Supabase migration for parser idempotency fields, checks, source evidence guards, and unique indexes.
5. Update docs to show Phase 3D readiness while keeping runtime parser persistence marked as future work.
6. Run formatting, TypeScript, tests, filename scanning, and safety scans.
7. Commit and push the completed slice.

## Verification

- New parser persistence mapper test must fail before implementation and pass after implementation.
- Full ingestion package tests must pass.
- TypeScript must pass for changed packages.
- No file names may include dates.
- No code may execute Terraform, Checkov, cloud CLIs, LLMs, or shell commands for parser persistence.
