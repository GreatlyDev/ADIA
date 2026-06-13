# Phase 3E Fixture Parser Persistence Plan

## Objective

Add server-side parser persistence orchestration for validated fixture parser output only.

## Tasks

1. Write failing orchestration tests against a fake Supabase client.
2. Resolve existing `raw_evidence_files` rows by organization, deployment run, evidence kind, format, and path.
3. Use Phase 3D row builders to construct parser table rows.
4. Upsert `terraform_plans`, `terraform_resource_changes`, `iac_scan_findings`, and `evidence_links` with Phase 3D conflict keys.
5. Return persisted row IDs and fingerprints for future callers.
6. Reject missing source evidence before writing parser output.
7. Update documentation to show Phase 3E is package-level orchestration only.
8. Verify formatting, TypeScript, tests, filename rules, and safety scans.

## Constraints

- No API routes.
- No LLM calls.
- No Terraform, Checkov, or cloud command execution.
- No artifact download.
- No dated filenames.
