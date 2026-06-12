# Phase 3C Parser Persistence Plan

## Objective

Document the future Supabase persistence design for Terraform plan summaries, Terraform resource changes, and Checkov findings without implementing writes.

## Constraints

- Documentation only.
- No migrations.
- No TypeScript persistence code.
- No LLM integration.
- No Terraform, Checkov, or cloud execution.
- No files with dates in their names.

## Work Plan

1. Inspect current Supabase schema, ingestion code, parser output types, and existing docs.
2. Define the future server-only parser persistence boundary.
3. Define table mappings for `terraform_plans`, `terraform_resource_changes`, and `iac_scan_findings`.
4. Define idempotency keys, fingerprints, and future migration needs.
5. Define RLS-safe server-side access rules.
6. Define evidence-link relationships and metadata.
7. Define future tests for mapping, idempotency, tenant checks, and evidence links.
8. Update README, architecture, PRD, schema, fixture, and decision docs to reflect Phase 3C planning status.
9. Run formatting and safety checks.
10. Commit and push the documentation-only phase.

## Expected Output

- `docs/PARSER_PERSISTENCE.md`
- Phase 3C spec and plan docs under `docs/superpowers`.
- Existing documentation updated to state that persistence is planned but not implemented.
