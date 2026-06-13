# Supabase Schema

## Purpose

Phase 1 gives ADIA a secure database foundation for deployment visibility. Phase 2B extends it with raw evidence-file metadata for fixture ingestion, Phase 2E reuses that path for verified GitHub webhook persistence, and Phase 3D adds parser idempotency fields for future writes. The schema stores organizations, projects, deployment runs, raw evidence metadata, Terraform evidence, IaC scan findings, deterministic anomaly records, insight records, recommendations, and evidence links.

These phases do not wire Supabase into the browser application. They also do not add parser execution, deterministic analyzer execution from routes, runtime parser output persistence, LLM generation, live dashboard queries, Edge Functions, artifact download, or Terraform apply behavior.

## Tenant Model

Organizations are the tenant boundary. Projects belong to one organization, and deployment evidence rows carry `organization_id` so row-level security policies can filter rows directly.

Deployment runs sit under projects and anchor the evidence graph for a specific run. Raw evidence files, Terraform plans, resource changes, IaC scan findings, anomalies, insights, recommendations, and evidence links all stay scoped to the same organization as their parent run.

Future server-side ingestion may use the Supabase service role from server-only code. The service role key must never be exposed to browser code.

## Role Model

Organization membership uses the `organization_role` enum:

- `owner`: can manage organization data and owner-level membership changes.
- `admin`: can manage project and evidence data, and can insert or update non-owner memberships.
- `member`: can read organization data.
- `viewer`: can read organization data.

Admins cannot insert, update, or delete owner membership rows. Owner membership management is reserved for owners.

## Table Groups

- Identity and scope: `organizations`, `organization_members`, `projects`.
- Deployment evidence: `deployment_runs`, `raw_evidence_files`, `terraform_plans`, `terraform_resource_changes`, `iac_scan_findings`.
- Analysis output: `anomalies`, `insights`, `recommendations`.
- Traceability: `evidence_links`.

## RLS Summary

Every application table has row-level security enabled.

Authenticated organization members can read most organization-scoped rows in their organization. The `organization_members` table is stricter: users can read their own membership row, and owners or admins can read membership rows in their organization. Owners and admins can insert, update, and delete organization-scoped project and evidence rows. Members and viewers do not receive direct write policies in Phase 1.

Membership checks use security-definer helper functions:

- `is_org_member(org_id uuid)`
- `has_org_role(org_id uuid, allowed_roles organization_role[])`

These functions are used inside policies to avoid recursive policy checks on the membership table.

## Raw Evidence Metadata

`raw_evidence_files` stores fixture and verified webhook evidence metadata:

- Evidence kind and format.
- Safe relative fixture path.
- Optional label.
- Optional file size and SHA-256 hash.
- JSON metadata copied from the validated ingestion envelope.

Webhook-created raw evidence rows do not have file size or SHA-256 values yet because Phase 2E does not fetch artifacts or read evidence files. This table does not store raw file contents, parse Terraform, parse Checkov, call LLMs, or execute infrastructure commands.

## Parser Persistence Planning

Phase 3C documents how future parser output should be persisted. Phase 3D adds the migration and row builders needed before runtime parser writes are implemented.

The future parser persistence layer should write:

- Terraform plan counts and compact metadata to `terraform_plans`.
- Terraform resource-level changes to `terraform_resource_changes`.
- Checkov findings to `iac_scan_findings`.
- Source-to-output traceability to `evidence_links`.

The Phase 3D migration adds replay-safe fields and indexes: source raw evidence references, parser versions, deterministic fingerprints, an `evidence_refs` column for `iac_scan_findings`, source-evidence consistency triggers, and duplicate-prevention indexes for parser rows and evidence links.

Runtime persistence is still future work. The migration prepares the database, but no route or CLI writes parser output yet.

See `docs/PARSER_PERSISTENCE.md` for the detailed future design.

## Consistency Guards

The migration adds constraints and triggers that reject inconsistent tenant or evidence relationships:

- Slugs must follow the lower-case dashed format used by organizations and projects.
- Deployment durations must be nonnegative, and completed runs cannot complete before they start.
- Terraform plan and risk counters must be nonnegative.
- Raw evidence files must use allowed evidence kinds and formats, safe relative paths, valid SHA-256 hashes, and nonnegative file sizes.
- Terraform resource changes must include at least one action.
- Deployment runs must belong to the same organization as their project.
- Terraform plans, findings, anomalies, insights, and recommendations must belong to the same organization as their deployment run.
- Terraform resource changes must match their plan, deployment run, and organization.
- Evidence links cannot self-reference the same source and target record.
- Evidence links validate that source and target records exist and belong to the link's organization.
- Evidence links with a deployment run must match that run's organization.

## Seed Data

`supabase/seed.sql` creates one demo organization, one demo project, three demo deployment runs, one Terraform plan summary, two Terraform resource changes, two Checkov-style findings, one anomaly, one static insight, two recommendations, and evidence links.

Phase 2B fixture ingestion and Phase 2E verified webhook persistence write new deployment runs and raw evidence metadata at runtime; the seed file remains deterministic static demo data. Phase 3D does not change seed data.

Seed timestamps are fixed fixture values so local resets remain deterministic. The seeded insight is static fixture data with a `generated: false` structured output flag. It is not generated by an LLM.

The seed file leaves local Auth membership as commented guidance because local Supabase Auth user IDs are environment-specific. After creating a local Supabase Auth user, attach that user to the demo organization with the commented SQL at the bottom of `supabase/seed.sql`.

## Local Validation

Run the normal workspace checks:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm format
pnpm build
```

If the Supabase CLI is installed and local services are configured, run:

```powershell
supabase db reset
```
