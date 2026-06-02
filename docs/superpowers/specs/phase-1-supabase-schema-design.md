# Phase 1 Supabase Schema Design

## Purpose

Phase 1 establishes ADIA's database foundation in Supabase. The goal is to create a secure multi-tenant schema with organizations, projects, deployment evidence records, analysis outputs, recommendations, and evidence links.

This phase creates schema, RLS policies, seed data, and validation documentation only. It does not implement ingestion APIs, Terraform parsing, Checkov parsing, deterministic anomaly logic, LLM calls, or live dashboard data wiring.

## Design Goals

- Make organizations the tenant boundary.
- Keep project data scoped to an organization.
- Use Supabase Auth user IDs for membership.
- Use simple roles: `owner`, `admin`, `member`, `viewer`.
- Let authenticated organization members read their organization's data.
- Let `owner` and `admin` members manage organization/project data.
- Keep future service-role ingestion possible without exposing service-role keys to the browser.
- Store raw evidence separately from normalized summaries where useful.
- Link insights and recommendations back to evidence records.

## Non-Goals

- No webhook ingestion.
- No Terraform or Checkov parsing.
- No LLM generation.
- No Supabase Edge Functions.
- No dashboard queries wired to live data.
- No organization invitation flow.
- No fine-grained permission matrix beyond the four simple roles.
- No destructive infrastructure actions.

## Enums

The migration will define Postgres enums that mirror current TypeScript concepts where practical:

- `organization_role`: `owner`, `admin`, `member`, `viewer`
- `deployment_status`: `queued`, `running`, `succeeded`, `failed`, `canceled`
- `deployment_source`: `github_actions`, `manual`, `fixture`
- `severity`: `info`, `low`, `medium`, `high`, `critical`
- `iac_scanner`: `checkov`, `tfsec`, `custom`
- `iac_finding_status`: `failed`, `passed`, `skipped`, `unknown`
- `recommendation_status`: `open`, `accepted`, `dismissed`, `resolved`

Terraform resource actions will be stored as `text[]` in Phase 1 instead of a Postgres enum array. This keeps the raw Terraform action list flexible while the parser is still unimplemented.

## Tables

### `organizations`

Stores tenant-level organization records.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `slug text not null unique`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `organization_members`

Connects Supabase Auth users to organizations.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `role organization_role not null default 'member'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `unique (organization_id, user_id)`

### `projects`

Stores deployment visibility scopes inside an organization.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `name text not null`
- `slug text not null`
- `repository_url text`
- `default_environment text not null default 'production'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `unique (organization_id, slug)`

### `deployment_runs`

Stores run-level CI/CD metadata.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `project_id uuid not null references projects(id) on delete cascade`
- `name text not null`
- `status deployment_status not null default 'queued'`
- `environment text not null`
- `source deployment_source not null`
- `commit_sha text`
- `branch text`
- `external_run_id text`
- `external_run_url text`
- `started_at timestamptz not null`
- `completed_at timestamptz`
- `duration_seconds integer`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

The `organization_id` is intentionally duplicated from `projects` for simpler RLS and query filters. A trigger will validate that the deployment run's organization matches its project.

### `terraform_plans`

Stores raw and summarized Terraform plan evidence.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `deployment_run_id uuid not null references deployment_runs(id) on delete cascade`
- `raw_plan jsonb`
- `summary jsonb not null default '{}'::jsonb`
- `creates integer not null default 0`
- `updates integer not null default 0`
- `deletes integer not null default 0`
- `replacements integer not null default 0`
- `risky_resource_count integer not null default 0`
- `iam_change_count integer not null default 0`
- `networking_change_count integer not null default 0`
- `public_exposure_count integer not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `terraform_resource_changes`

Stores normalized resource-level changes.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `terraform_plan_id uuid not null references terraform_plans(id) on delete cascade`
- `deployment_run_id uuid not null references deployment_runs(id) on delete cascade`
- `address text not null`
- `type text not null`
- `name text not null`
- `actions text[] not null default '{}'::text[]`
- `provider_name text`
- `module_address text`
- `risk_flags text[] not null default '{}'::text[]`
- `evidence_path text`
- `change_summary text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `iac_scan_findings`

Stores normalized IaC scan findings.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `deployment_run_id uuid not null references deployment_runs(id) on delete cascade`
- `scanner iac_scanner not null`
- `status iac_finding_status not null default 'unknown'`
- `severity severity not null default 'info'`
- `check_id text not null`
- `title text not null`
- `resource text`
- `file_path text`
- `guideline text`
- `raw_finding jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `anomalies`

Stores deterministic anomaly output.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `deployment_run_id uuid not null references deployment_runs(id) on delete cascade`
- `severity severity not null`
- `category text`
- `title text not null`
- `summary text not null`
- `detected_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `insights`

Stores structured server-side LLM insight records created in future phases.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `deployment_run_id uuid not null references deployment_runs(id) on delete cascade`
- `severity severity not null default 'info'`
- `title text not null`
- `summary text not null`
- `model text`
- `structured_output jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `recommendations`

Stores advisory recommendations. These records do not execute infrastructure changes.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `deployment_run_id uuid not null references deployment_runs(id) on delete cascade`
- `severity severity not null default 'info'`
- `title text not null`
- `summary text not null`
- `status recommendation_status not null default 'open'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `evidence_links`

Stores typed references connecting findings, anomalies, insights, and recommendations back to source evidence.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `deployment_run_id uuid references deployment_runs(id) on delete cascade`
- `source_table text not null`
- `source_id uuid not null`
- `target_table text not null`
- `target_id uuid not null`
- `label text`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Phase 1 will enforce allowed table names with check constraints. It will not create polymorphic foreign keys because Postgres cannot enforce them directly without more complex triggers.

## Shared Functions

The migration will add helper functions:

- `set_updated_at()` for `updated_at` triggers.
- `is_org_member(org_id uuid)` returns whether `auth.uid()` is a member.
- `has_org_role(org_id uuid, allowed_roles organization_role[])` returns whether `auth.uid()` has any allowed role.
- `assert_project_org_matches()` validates project-scoped child records with duplicated `organization_id`.
- `assert_run_org_matches()` validates run-scoped child records with duplicated `organization_id`.

Helper functions will be `security definer` where needed for RLS-safe membership checks and will set a fixed `search_path`.

## RLS Policy Shape

RLS will be enabled for every application table.

Read policy:

- Authenticated organization members can read rows for their organization.

Write policy:

- `owner` and `admin` can insert, update, and delete most organization-scoped records.
- `member` and `viewer` cannot write directly in Phase 1.
- Future ingestion APIs can use server-side service role access, which bypasses RLS. Service role keys must never be exposed to the browser.

Membership policies:

- Users can read their own membership rows.
- Organization owners/admins can read all membership rows in their organization.
- Organization owners/admins can add or update members.
- The last owner protection workflow is deferred until invitation/member management becomes a UI feature.

## Seed Data

`supabase/seed.sql` will create deterministic demo data:

- One demo organization.
- One demo project.
- Three deployment runs.
- One Terraform plan summary.
- Two Terraform resource changes.
- Two Checkov-style findings.
- One anomaly.
- One insight.
- Two recommendations.
- Evidence links connecting the insight/recommendations to the demo evidence.

Seed data will not create Supabase Auth users because local Supabase Auth seed mechanics are environment-specific. Membership examples will be documented with commented SQL showing how to attach an existing auth user ID after local auth setup.

## TypeScript Alignment

`packages/core/src/index.ts` will be updated only where needed to align shared types with the schema:

- Add organization and project types.
- Add organization role type.
- Add evidence link type.
- Keep analyzer behavior unchanged.

No Supabase client code will be added in Phase 1.

## Validation

Phase 1 will be validated with:

- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm format`
- `pnpm build`

If Supabase CLI is installed locally, also validate with:

- `supabase db reset`
- SQL checks against seeded tables.

If Supabase CLI is not installed, Phase 1 will still provide migration SQL and seed SQL ready for Supabase CLI use.

## Definition of Done

Phase 1 is complete when:

- A Supabase migration creates all Phase 1 enums, tables, indexes, triggers, helper functions, and RLS policies.
- `supabase/seed.sql` contains deterministic demo data.
- Documentation explains how the schema and RLS model work.
- Shared TypeScript types include organization, project, and evidence link concepts.
- Existing web UI remains static and unchanged except for documentation references if needed.
- No ingestion APIs, parser logic, LLM calls, or live dashboard wiring are implemented.
- All available local checks pass.
