# Phase 1 Supabase Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ADIA's Phase 1 Supabase database foundation: schema, RLS, seed data, shared TypeScript type alignment, and schema documentation.

**Architecture:** Supabase Postgres is the multi-tenant evidence store, with organizations as the tenant boundary and projects/deployment runs scoped beneath them. Deterministic evidence tables store deployment, Terraform, IaC, anomaly, insight, recommendation, and evidence-link records; no ingestion API, parser, LLM call, or live dashboard wiring is added in this phase.

**Tech Stack:** Supabase Postgres SQL, Row Level Security, TypeScript, pnpm workspaces, Vitest, Next.js App Router.

---

## File Structure

- Create: `supabase/migrations/0001_phase_1_schema.sql`
  - Defines extensions, enums, tables, constraints, indexes, triggers, helper functions, and RLS policies.
  - Uses an incremental numeric prefix instead of a date or timestamp prefix to honor the project filename convention.
- Modify: `supabase/seed.sql`
  - Replaces the Phase 0 seed comment with deterministic demo data for the Phase 1 schema.
  - Keeps auth user membership as commented guidance, because local Supabase Auth user IDs are environment-specific.
- Modify: `packages/core/src/index.ts`
  - Adds organization, membership, project, and evidence-link types.
  - Aligns existing deployment and evidence types with the Phase 1 schema without adding Supabase client code.
- Create: `docs/SUPABASE_SCHEMA.md`
  - Explains the tenant model, table groups, RLS policy shape, seed data, and local validation commands.
- Modify: `docs/ARCHITECTURE.md`
  - Adds a short Phase 1 schema note that links the architecture pipeline to the database foundation.

## Scope Boundaries

Phase 1 creates database and type foundations only.

- No webhook ingestion.
- No Terraform JSON parsing.
- No Checkov JSON parsing.
- No deterministic anomaly implementation.
- No LLM integration.
- No Supabase Edge Functions.
- No browser-exposed service role key.
- No Terraform apply flow.

## Task 1: Create The Phase 1 Migration

**Files:**

- Create: `supabase/migrations/0001_phase_1_schema.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/0001_phase_1_schema.sql` with this SQL:

```sql
create extension if not exists "pgcrypto";

do $$
begin
  if to_regtype('public.organization_role') is null then
    create type public.organization_role as enum ('owner', 'admin', 'member', 'viewer');
  end if;

  if to_regtype('public.deployment_status') is null then
    create type public.deployment_status as enum ('queued', 'running', 'succeeded', 'failed', 'canceled');
  end if;

  if to_regtype('public.deployment_source') is null then
    create type public.deployment_source as enum ('github_actions', 'manual', 'fixture');
  end if;

  if to_regtype('public.severity') is null then
    create type public.severity as enum ('info', 'low', 'medium', 'high', 'critical');
  end if;

  if to_regtype('public.iac_scanner') is null then
    create type public.iac_scanner as enum ('checkov', 'tfsec', 'custom');
  end if;

  if to_regtype('public.iac_finding_status') is null then
    create type public.iac_finding_status as enum ('failed', 'passed', 'skipped', 'unknown');
  end if;

  if to_regtype('public.recommendation_status') is null then
    create type public.recommendation_status as enum ('open', 'accepted', 'dismissed', 'resolved');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  repository_url text,
  default_environment text not null default 'production',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  constraint projects_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.deployment_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  status public.deployment_status not null default 'queued',
  environment text not null,
  source public.deployment_source not null,
  commit_sha text,
  branch text,
  external_run_id text,
  external_run_url text,
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deployment_runs_duration_nonnegative check (duration_seconds is null or duration_seconds >= 0),
  constraint deployment_runs_time_order check (completed_at is null or completed_at >= started_at)
);

create table if not exists public.terraform_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deployment_run_id uuid not null references public.deployment_runs(id) on delete cascade,
  raw_plan jsonb,
  summary jsonb not null default '{}'::jsonb,
  creates integer not null default 0,
  updates integer not null default 0,
  deletes integer not null default 0,
  replacements integer not null default 0,
  risky_resource_count integer not null default 0,
  iam_change_count integer not null default 0,
  networking_change_count integer not null default 0,
  public_exposure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terraform_plan_counts_nonnegative check (
    creates >= 0
    and updates >= 0
    and deletes >= 0
    and replacements >= 0
    and risky_resource_count >= 0
    and iam_change_count >= 0
    and networking_change_count >= 0
    and public_exposure_count >= 0
  )
);

create table if not exists public.terraform_resource_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  terraform_plan_id uuid not null references public.terraform_plans(id) on delete cascade,
  deployment_run_id uuid not null references public.deployment_runs(id) on delete cascade,
  address text not null,
  type text not null,
  name text not null,
  actions text[] not null,
  provider_name text,
  module_address text,
  risk_flags text[] not null default '{}'::text[],
  evidence_path text,
  change_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terraform_resource_changes_actions_present check (array_length(actions, 1) is not null)
);

create table if not exists public.iac_scan_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deployment_run_id uuid not null references public.deployment_runs(id) on delete cascade,
  scanner public.iac_scanner not null,
  status public.iac_finding_status not null default 'unknown',
  severity public.severity not null default 'info',
  check_id text not null,
  title text not null,
  resource text,
  file_path text,
  guideline text,
  raw_finding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.anomalies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deployment_run_id uuid not null references public.deployment_runs(id) on delete cascade,
  severity public.severity not null,
  category text,
  title text not null,
  summary text not null,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deployment_run_id uuid not null references public.deployment_runs(id) on delete cascade,
  severity public.severity not null default 'info',
  title text not null,
  summary text not null,
  model text,
  structured_output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deployment_run_id uuid not null references public.deployment_runs(id) on delete cascade,
  severity public.severity not null default 'info',
  title text not null,
  summary text not null,
  status public.recommendation_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deployment_run_id uuid references public.deployment_runs(id) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  target_table text not null,
  target_id uuid not null,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint evidence_links_source_table_allowed check (
    source_table in (
      'deployment_runs',
      'terraform_plans',
      'terraform_resource_changes',
      'iac_scan_findings',
      'anomalies',
      'insights',
      'recommendations'
    )
  ),
  constraint evidence_links_target_table_allowed check (
    target_table in (
      'deployment_runs',
      'terraform_plans',
      'terraform_resource_changes',
      'iac_scan_findings',
      'anomalies',
      'insights',
      'recommendations'
    )
  ),
  constraint evidence_links_not_self_reference check (
    source_table <> target_table or source_id <> target_id
  )
);

create index if not exists organization_members_org_idx on public.organization_members(organization_id);
create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists projects_org_idx on public.projects(organization_id);
create index if not exists deployment_runs_org_idx on public.deployment_runs(organization_id);
create index if not exists deployment_runs_project_idx on public.deployment_runs(project_id);
create index if not exists deployment_runs_status_idx on public.deployment_runs(status);
create index if not exists terraform_plans_org_idx on public.terraform_plans(organization_id);
create index if not exists terraform_plans_run_idx on public.terraform_plans(deployment_run_id);
create index if not exists terraform_resource_changes_org_idx on public.terraform_resource_changes(organization_id);
create index if not exists terraform_resource_changes_plan_idx on public.terraform_resource_changes(terraform_plan_id);
create index if not exists terraform_resource_changes_run_idx on public.terraform_resource_changes(deployment_run_id);
create index if not exists iac_scan_findings_org_idx on public.iac_scan_findings(organization_id);
create index if not exists iac_scan_findings_run_idx on public.iac_scan_findings(deployment_run_id);
create index if not exists iac_scan_findings_severity_idx on public.iac_scan_findings(severity);
create index if not exists anomalies_org_idx on public.anomalies(organization_id);
create index if not exists anomalies_run_idx on public.anomalies(deployment_run_id);
create index if not exists insights_org_idx on public.insights(organization_id);
create index if not exists insights_run_idx on public.insights(deployment_run_id);
create index if not exists recommendations_org_idx on public.recommendations(organization_id);
create index if not exists recommendations_run_idx on public.recommendations(deployment_run_id);
create index if not exists recommendations_status_idx on public.recommendations(status);
create index if not exists evidence_links_org_idx on public.evidence_links(organization_id);
create index if not exists evidence_links_run_idx on public.evidence_links(deployment_run_id);
create index if not exists evidence_links_source_idx on public.evidence_links(source_table, source_id);
create index if not exists evidence_links_target_idx on public.evidence_links(target_table, target_id);

create or replace function public.assert_project_org_matches()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.projects
    where id = new.project_id
      and organization_id = new.organization_id
  ) then
    raise exception 'project_id must belong to organization_id';
  end if;

  return new;
end;
$$;

create or replace function public.assert_run_org_matches()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.deployment_runs
    where id = new.deployment_run_id
      and organization_id = new.organization_id
  ) then
    raise exception 'deployment_run_id must belong to organization_id';
  end if;

  return new;
end;
$$;

create or replace function public.assert_resource_change_consistency()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.terraform_plans
    where id = new.terraform_plan_id
      and deployment_run_id = new.deployment_run_id
      and organization_id = new.organization_id
  ) then
    raise exception 'terraform_plan_id must belong to deployment_run_id and organization_id';
  end if;

  return new;
end;
$$;

create or replace function public.evidence_record_belongs_to_org(
  table_name text,
  record_id uuid,
  target_org_id uuid
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  case table_name
    when 'deployment_runs' then
      return exists (
        select 1
        from public.deployment_runs
        where id = record_id
          and organization_id = target_org_id
      );
    when 'terraform_plans' then
      return exists (
        select 1
        from public.terraform_plans
        where id = record_id
          and organization_id = target_org_id
      );
    when 'terraform_resource_changes' then
      return exists (
        select 1
        from public.terraform_resource_changes
        where id = record_id
          and organization_id = target_org_id
      );
    when 'iac_scan_findings' then
      return exists (
        select 1
        from public.iac_scan_findings
        where id = record_id
          and organization_id = target_org_id
      );
    when 'anomalies' then
      return exists (
        select 1
        from public.anomalies
        where id = record_id
          and organization_id = target_org_id
      );
    when 'insights' then
      return exists (
        select 1
        from public.insights
        where id = record_id
          and organization_id = target_org_id
      );
    when 'recommendations' then
      return exists (
        select 1
        from public.recommendations
        where id = record_id
          and organization_id = target_org_id
      );
    else
      return false;
  end case;
end;
$$;

create or replace function public.assert_evidence_link_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deployment_run_id is not null and not exists (
    select 1
    from public.deployment_runs
    where id = new.deployment_run_id
      and organization_id = new.organization_id
  ) then
    raise exception 'deployment_run_id must belong to organization_id';
  end if;

  if not public.evidence_record_belongs_to_org(new.source_table, new.source_id, new.organization_id) then
    raise exception 'evidence link source must exist and belong to organization_id';
  end if;

  if not public.evidence_record_belongs_to_org(new.target_table, new.target_id, new.organization_id) then
    raise exception 'evidence link target must exist and belong to organization_id';
  end if;

  return new;
end;
$$;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists deployment_runs_set_updated_at on public.deployment_runs;
create trigger deployment_runs_set_updated_at
before update on public.deployment_runs
for each row execute function public.set_updated_at();

drop trigger if exists terraform_plans_set_updated_at on public.terraform_plans;
create trigger terraform_plans_set_updated_at
before update on public.terraform_plans
for each row execute function public.set_updated_at();

drop trigger if exists terraform_resource_changes_set_updated_at on public.terraform_resource_changes;
create trigger terraform_resource_changes_set_updated_at
before update on public.terraform_resource_changes
for each row execute function public.set_updated_at();

drop trigger if exists iac_scan_findings_set_updated_at on public.iac_scan_findings;
create trigger iac_scan_findings_set_updated_at
before update on public.iac_scan_findings
for each row execute function public.set_updated_at();

drop trigger if exists anomalies_set_updated_at on public.anomalies;
create trigger anomalies_set_updated_at
before update on public.anomalies
for each row execute function public.set_updated_at();

drop trigger if exists insights_set_updated_at on public.insights;
create trigger insights_set_updated_at
before update on public.insights
for each row execute function public.set_updated_at();

drop trigger if exists recommendations_set_updated_at on public.recommendations;
create trigger recommendations_set_updated_at
before update on public.recommendations
for each row execute function public.set_updated_at();

drop trigger if exists deployment_runs_project_org_guard on public.deployment_runs;
create trigger deployment_runs_project_org_guard
before insert or update on public.deployment_runs
for each row execute function public.assert_project_org_matches();

drop trigger if exists terraform_plans_run_org_guard on public.terraform_plans;
create trigger terraform_plans_run_org_guard
before insert or update on public.terraform_plans
for each row execute function public.assert_run_org_matches();

drop trigger if exists terraform_resource_changes_run_org_guard on public.terraform_resource_changes;
create trigger terraform_resource_changes_run_org_guard
before insert or update on public.terraform_resource_changes
for each row execute function public.assert_run_org_matches();

drop trigger if exists terraform_resource_changes_plan_guard on public.terraform_resource_changes;
create trigger terraform_resource_changes_plan_guard
before insert or update on public.terraform_resource_changes
for each row execute function public.assert_resource_change_consistency();

drop trigger if exists iac_scan_findings_run_org_guard on public.iac_scan_findings;
create trigger iac_scan_findings_run_org_guard
before insert or update on public.iac_scan_findings
for each row execute function public.assert_run_org_matches();

drop trigger if exists anomalies_run_org_guard on public.anomalies;
create trigger anomalies_run_org_guard
before insert or update on public.anomalies
for each row execute function public.assert_run_org_matches();

drop trigger if exists insights_run_org_guard on public.insights;
create trigger insights_run_org_guard
before insert or update on public.insights
for each row execute function public.assert_run_org_matches();

drop trigger if exists recommendations_run_org_guard on public.recommendations;
create trigger recommendations_run_org_guard
before insert or update on public.recommendations
for each row execute function public.assert_run_org_matches();

drop trigger if exists evidence_links_run_org_guard on public.evidence_links;
create trigger evidence_links_run_org_guard
before insert or update on public.evidence_links
for each row execute function public.assert_evidence_link_consistency();

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, allowed_roles public.organization_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, public.organization_role[]) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.organization_role[]) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.deployment_runs enable row level security;
alter table public.terraform_plans enable row level security;
alter table public.terraform_resource_changes enable row level security;
alter table public.iac_scan_findings enable row level security;
alter table public.anomalies enable row level security;
alter table public.insights enable row level security;
alter table public.recommendations enable row level security;
alter table public.evidence_links enable row level security;

drop policy if exists "Members can read organizations" on public.organizations;
create policy "Members can read organizations"
on public.organizations
for select
to authenticated
using (public.is_org_member(id));

drop policy if exists "Admins can update organizations" on public.organizations;
create policy "Admins can update organizations"
on public.organizations
for update
to authenticated
using (public.has_org_role(id, array['owner', 'admin']::public.organization_role[]))
with check (public.has_org_role(id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Owners can delete organizations" on public.organizations;
create policy "Owners can delete organizations"
on public.organizations
for delete
to authenticated
using (public.has_org_role(id, array['owner']::public.organization_role[]));

drop policy if exists "Users can read own memberships" on public.organization_members;
create policy "Users can read own memberships"
on public.organization_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read organization memberships" on public.organization_members;
create policy "Admins can read organization memberships"
on public.organization_members
for select
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can insert organization memberships" on public.organization_members;
drop policy if exists "Owners can insert organization memberships" on public.organization_members;
create policy "Owners can insert organization memberships"
on public.organization_members
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner']::public.organization_role[]));

drop policy if exists "Admins can insert non-owner organization memberships" on public.organization_members;
create policy "Admins can insert non-owner organization memberships"
on public.organization_members
for insert
to authenticated
with check (
  role <> 'owner'
  and public.has_org_role(organization_id, array['admin']::public.organization_role[])
);

drop policy if exists "Admins can update organization memberships" on public.organization_members;
drop policy if exists "Owners can update organization memberships" on public.organization_members;
create policy "Owners can update organization memberships"
on public.organization_members
for update
to authenticated
using (public.has_org_role(organization_id, array['owner']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner']::public.organization_role[]));

drop policy if exists "Admins can update non-owner organization memberships" on public.organization_members;
create policy "Admins can update non-owner organization memberships"
on public.organization_members
for update
to authenticated
using (
  role <> 'owner'
  and public.has_org_role(organization_id, array['admin']::public.organization_role[])
)
with check (
  role <> 'owner'
  and public.has_org_role(organization_id, array['admin']::public.organization_role[])
);

drop policy if exists "Owners can delete organization memberships" on public.organization_members;
create policy "Owners can delete organization memberships"
on public.organization_members
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner']::public.organization_role[]));

drop policy if exists "Members can read projects" on public.projects;
create policy "Members can read projects"
on public.projects
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "Admins can insert projects" on public.projects;
create policy "Admins can insert projects"
on public.projects
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can update projects" on public.projects;
create policy "Admins can update projects"
on public.projects
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can delete projects" on public.projects;
create policy "Admins can delete projects"
on public.projects
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Members can read deployment runs" on public.deployment_runs;
create policy "Members can read deployment runs"
on public.deployment_runs
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "Admins can insert deployment runs" on public.deployment_runs;
create policy "Admins can insert deployment runs"
on public.deployment_runs
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can update deployment runs" on public.deployment_runs;
create policy "Admins can update deployment runs"
on public.deployment_runs
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can delete deployment runs" on public.deployment_runs;
create policy "Admins can delete deployment runs"
on public.deployment_runs
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Members can read terraform plans" on public.terraform_plans;
create policy "Members can read terraform plans"
on public.terraform_plans
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "Admins can insert terraform plans" on public.terraform_plans;
create policy "Admins can insert terraform plans"
on public.terraform_plans
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can update terraform plans" on public.terraform_plans;
create policy "Admins can update terraform plans"
on public.terraform_plans
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can delete terraform plans" on public.terraform_plans;
create policy "Admins can delete terraform plans"
on public.terraform_plans
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Members can read terraform resource changes" on public.terraform_resource_changes;
create policy "Members can read terraform resource changes"
on public.terraform_resource_changes
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "Admins can insert terraform resource changes" on public.terraform_resource_changes;
create policy "Admins can insert terraform resource changes"
on public.terraform_resource_changes
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can update terraform resource changes" on public.terraform_resource_changes;
create policy "Admins can update terraform resource changes"
on public.terraform_resource_changes
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can delete terraform resource changes" on public.terraform_resource_changes;
create policy "Admins can delete terraform resource changes"
on public.terraform_resource_changes
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Members can read iac scan findings" on public.iac_scan_findings;
create policy "Members can read iac scan findings"
on public.iac_scan_findings
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "Admins can insert iac scan findings" on public.iac_scan_findings;
create policy "Admins can insert iac scan findings"
on public.iac_scan_findings
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can update iac scan findings" on public.iac_scan_findings;
create policy "Admins can update iac scan findings"
on public.iac_scan_findings
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can delete iac scan findings" on public.iac_scan_findings;
create policy "Admins can delete iac scan findings"
on public.iac_scan_findings
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Members can read anomalies" on public.anomalies;
create policy "Members can read anomalies"
on public.anomalies
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "Admins can insert anomalies" on public.anomalies;
create policy "Admins can insert anomalies"
on public.anomalies
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can update anomalies" on public.anomalies;
create policy "Admins can update anomalies"
on public.anomalies
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can delete anomalies" on public.anomalies;
create policy "Admins can delete anomalies"
on public.anomalies
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Members can read insights" on public.insights;
create policy "Members can read insights"
on public.insights
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "Admins can insert insights" on public.insights;
create policy "Admins can insert insights"
on public.insights
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can update insights" on public.insights;
create policy "Admins can update insights"
on public.insights
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can delete insights" on public.insights;
create policy "Admins can delete insights"
on public.insights
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Members can read recommendations" on public.recommendations;
create policy "Members can read recommendations"
on public.recommendations
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "Admins can insert recommendations" on public.recommendations;
create policy "Admins can insert recommendations"
on public.recommendations
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can update recommendations" on public.recommendations;
create policy "Admins can update recommendations"
on public.recommendations
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can delete recommendations" on public.recommendations;
create policy "Admins can delete recommendations"
on public.recommendations
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Members can read evidence links" on public.evidence_links;
create policy "Members can read evidence links"
on public.evidence_links
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "Admins can insert evidence links" on public.evidence_links;
create policy "Admins can insert evidence links"
on public.evidence_links
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can update evidence links" on public.evidence_links;
create policy "Admins can update evidence links"
on public.evidence_links
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can delete evidence links" on public.evidence_links;
create policy "Admins can delete evidence links"
on public.evidence_links
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));
```

- [ ] **Step 2: Review the migration for forbidden behavior**

Run:

```powershell
rg -n "terraform apply|service_role|llm|openai|anthropic" supabase\migrations\0001_phase_1_schema.sql
```

Expected:

- `service_role` may be absent.
- No result should indicate executable infrastructure actions, browser secrets, or LLM calls.

- [ ] **Step 3: Commit the migration**

Run:

```powershell
git add supabase/migrations/0001_phase_1_schema.sql
git commit -m "Add Phase 1 Supabase schema migration"
```

Expected: commit succeeds.

## Task 2: Add Deterministic Seed Data

**Files:**

- Modify: `supabase/seed.sql`

- [ ] **Step 1: Replace the seed file**

Replace `supabase/seed.sql` with this SQL:

```sql
-- ADIA Phase 1 demo seed data.
-- Auth users are not created here because Supabase Auth seed IDs vary by local environment.

insert into public.organizations (id, name, slug)
values
  ('11111111-1111-1111-1111-111111111111', 'ADIA Demo Organization', 'adia-demo-org')
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug;

insert into public.projects (id, organization_id, name, slug, repository_url, default_environment)
values
  (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'ADIA Demo Service',
    'adia-demo-service',
    'https://github.com/GreatlyDev/ADIA',
    'production'
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  name = excluded.name,
  slug = excluded.slug,
  repository_url = excluded.repository_url,
  default_environment = excluded.default_environment;

insert into public.deployment_runs (
  id,
  organization_id,
  project_id,
  name,
  status,
  environment,
  source,
  commit_sha,
  branch,
  external_run_id,
  external_run_url,
  started_at,
  completed_at,
  duration_seconds,
  metadata
)
values
  (
    '33333333-3333-3333-3333-333333333331',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'Demo deploy succeeded',
    'succeeded',
    'production',
    'fixture',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'main',
    'demo-run-1',
    null,
    '2026-01-15 14:00:00+00'::timestamptz,
    '2026-01-15 14:08:00+00'::timestamptz,
    480,
    '{"trigger":"fixture","stage":"phase_1"}'::jsonb
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'Demo deploy blocked by policy findings',
    'failed',
    'production',
    'fixture',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'main',
    'demo-run-2',
    null,
    '2026-01-15 15:30:00+00'::timestamptz,
    '2026-01-15 15:42:00+00'::timestamptz,
    720,
    '{"trigger":"fixture","stage":"phase_1"}'::jsonb
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'Demo deploy in progress',
    'running',
    'staging',
    'fixture',
    'cccccccccccccccccccccccccccccccccccccccc',
    'feature/demo-risk-panel',
    'demo-run-3',
    null,
    '2026-01-15 16:15:00+00'::timestamptz,
    null,
    null,
    '{"trigger":"fixture","stage":"phase_1"}'::jsonb
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  project_id = excluded.project_id,
  name = excluded.name,
  status = excluded.status,
  environment = excluded.environment,
  source = excluded.source,
  commit_sha = excluded.commit_sha,
  branch = excluded.branch,
  external_run_id = excluded.external_run_id,
  external_run_url = excluded.external_run_url,
  started_at = excluded.started_at,
  completed_at = excluded.completed_at,
  duration_seconds = excluded.duration_seconds,
  metadata = excluded.metadata;

insert into public.terraform_plans (
  id,
  organization_id,
  deployment_run_id,
  raw_plan,
  summary,
  creates,
  updates,
  deletes,
  replacements,
  risky_resource_count,
  iam_change_count,
  networking_change_count,
  public_exposure_count
)
values (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333332',
  '{
    "format_version": "fixture",
    "resource_changes": [
      {
        "address": "aws_security_group.web",
        "type": "aws_security_group",
        "name": "web",
        "provider_name": "registry.terraform.io/hashicorp/aws",
        "change": {
          "actions": ["create"],
          "after": {
            "name": "web"
          }
        }
      },
      {
        "address": "aws_iam_policy.deploy",
        "type": "aws_iam_policy",
        "name": "deploy",
        "provider_name": "registry.terraform.io/hashicorp/aws",
        "change": {
          "actions": ["update"],
          "after": {
            "name": "deploy"
          }
        }
      }
    ]
  }'::jsonb,
  '{"note":"Fixture summary for Phase 1 schema validation"}'::jsonb,
  2,
  1,
  0,
  1,
  2,
  1,
  1,
  1
)
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  deployment_run_id = excluded.deployment_run_id,
  raw_plan = excluded.raw_plan,
  summary = excluded.summary,
  creates = excluded.creates,
  updates = excluded.updates,
  deletes = excluded.deletes,
  replacements = excluded.replacements,
  risky_resource_count = excluded.risky_resource_count,
  iam_change_count = excluded.iam_change_count,
  networking_change_count = excluded.networking_change_count,
  public_exposure_count = excluded.public_exposure_count;

insert into public.terraform_resource_changes (
  id,
  organization_id,
  terraform_plan_id,
  deployment_run_id,
  address,
  type,
  name,
  actions,
  provider_name,
  module_address,
  risk_flags,
  evidence_path,
  change_summary
)
values
  (
    '55555555-5555-5555-5555-555555555551',
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444',
    '33333333-3333-3333-3333-333333333332',
    'aws_security_group.web',
    'aws_security_group',
    'web',
    array['create'],
    'registry.terraform.io/hashicorp/aws',
    null,
    array['networking', 'public_exposure'],
    'resource_changes[0]',
    'Creates a security group with broad inbound access in fixture data.'
  ),
  (
    '55555555-5555-5555-5555-555555555552',
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444',
    '33333333-3333-3333-3333-333333333332',
    'aws_iam_policy.deploy',
    'aws_iam_policy',
    'deploy',
    array['update'],
    'registry.terraform.io/hashicorp/aws',
    null,
    array['iam'],
    'resource_changes[1]',
    'Updates an IAM policy in fixture data.'
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  terraform_plan_id = excluded.terraform_plan_id,
  deployment_run_id = excluded.deployment_run_id,
  address = excluded.address,
  type = excluded.type,
  name = excluded.name,
  actions = excluded.actions,
  provider_name = excluded.provider_name,
  module_address = excluded.module_address,
  risk_flags = excluded.risk_flags,
  evidence_path = excluded.evidence_path,
  change_summary = excluded.change_summary;

insert into public.iac_scan_findings (
  id,
  organization_id,
  deployment_run_id,
  scanner,
  status,
  severity,
  check_id,
  title,
  resource,
  file_path,
  guideline,
  raw_finding
)
values
  (
    '66666666-6666-6666-6666-666666666661',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    'checkov',
    'failed',
    'high',
    'CKV_AWS_24',
    'Ensure no security groups allow ingress from all IPs to port 22',
    'aws_security_group.web',
    'infra/demo/security_group.tf',
    'https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-networking-policies/networking-1-port-security',
    '{"check_id":"CKV_AWS_24","result":"FAILED"}'::jsonb
  ),
  (
    '66666666-6666-6666-6666-666666666662',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    'checkov',
    'failed',
    'medium',
    'CKV_AWS_111',
    'Ensure IAM policies do not allow broad write privileges',
    'aws_iam_policy.deploy',
    'infra/demo/iam.tf',
    'https://docs.prismacloud.io/en/enterprise-edition/policy-reference/aws-policies/aws-iam-policies',
    '{"check_id":"CKV_AWS_111","result":"FAILED"}'::jsonb
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  deployment_run_id = excluded.deployment_run_id,
  scanner = excluded.scanner,
  status = excluded.status,
  severity = excluded.severity,
  check_id = excluded.check_id,
  title = excluded.title,
  resource = excluded.resource,
  file_path = excluded.file_path,
  guideline = excluded.guideline,
  raw_finding = excluded.raw_finding;

insert into public.anomalies (
  id,
  organization_id,
  deployment_run_id,
  severity,
  category,
  title,
  summary,
  detected_at
)
values (
  '77777777-7777-7777-7777-777777777777',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333332',
  'high',
  'public_exposure',
  'Public exposure risk detected in fixture plan',
  'The fixture Terraform plan includes a networking change and a Checkov finding tied to broad ingress.',
  '2026-01-15 15:43:00+00'::timestamptz
)
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  deployment_run_id = excluded.deployment_run_id,
  severity = excluded.severity,
  category = excluded.category,
  title = excluded.title,
  summary = excluded.summary,
  detected_at = excluded.detected_at;

insert into public.insights (
  id,
  organization_id,
  deployment_run_id,
  severity,
  title,
  summary,
  model,
  structured_output
)
values (
  '88888888-8888-8888-8888-888888888888',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333332',
  'high',
  'Fixture insight: review public networking before deployment',
  'This seeded insight represents the shape of a future evidence-grounded LLM summary. It is static seed data, not generated by an LLM.',
  null,
  '{"evidence":["terraform_resource_changes","iac_scan_findings"],"generated":false}'::jsonb
)
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  deployment_run_id = excluded.deployment_run_id,
  severity = excluded.severity,
  title = excluded.title,
  summary = excluded.summary,
  model = excluded.model,
  structured_output = excluded.structured_output;

insert into public.recommendations (
  id,
  organization_id,
  deployment_run_id,
  severity,
  title,
  summary,
  status
)
values
  (
    '99999999-9999-9999-9999-999999999991',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    'high',
    'Restrict broad ingress before promotion',
    'Review the security group rule in fixture evidence and narrow allowed source ranges before deployment approval.',
    'open'
  ),
  (
    '99999999-9999-9999-9999-999999999992',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    'medium',
    'Review IAM policy scope',
    'Compare the IAM policy update against least-privilege expectations before approving the change.',
    'open'
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  deployment_run_id = excluded.deployment_run_id,
  severity = excluded.severity,
  title = excluded.title,
  summary = excluded.summary,
  status = excluded.status;

insert into public.evidence_links (
  id,
  organization_id,
  deployment_run_id,
  source_table,
  source_id,
  target_table,
  target_id,
  label,
  metadata
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    'insights',
    '88888888-8888-8888-8888-888888888888',
    'terraform_resource_changes',
    '55555555-5555-5555-5555-555555555551',
    'Insight references public security group change',
    '{"relationship":"supports"}'::jsonb
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    'recommendations',
    '99999999-9999-9999-9999-999999999991',
    'iac_scan_findings',
    '66666666-6666-6666-6666-666666666661',
    'Recommendation references Checkov networking finding',
    '{"relationship":"supports"}'::jsonb
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    'recommendations',
    '99999999-9999-9999-9999-999999999992',
    'iac_scan_findings',
    '66666666-6666-6666-6666-666666666662',
    'Recommendation references Checkov IAM finding',
    '{"relationship":"supports"}'::jsonb
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  deployment_run_id = excluded.deployment_run_id,
  source_table = excluded.source_table,
  source_id = excluded.source_id,
  target_table = excluded.target_table,
  target_id = excluded.target_id,
  label = excluded.label,
  metadata = excluded.metadata;

-- After creating a local Supabase Auth user, attach it to the demo organization with:
-- insert into public.organization_members (organization_id, user_id, role)
-- values ('11111111-1111-1111-1111-111111111111', '<local-auth-user-id>', 'owner');
```

- [ ] **Step 2: Verify seed safety**

Run:

```powershell
rg -n "SUPABASE_SERVICE_ROLE_KEY|LLM_API_KEY|terraform apply|aws_access_key|secret_access_key" supabase\seed.sql
```

Expected: no output.

- [ ] **Step 3: Commit the seed data**

Run:

```powershell
git add supabase/seed.sql
git commit -m "Add Phase 1 Supabase seed data"
```

Expected: commit succeeds.

## Task 3: Align Shared TypeScript Types

**Files:**

- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Replace the shared type file**

Replace `packages/core/src/index.ts` with this TypeScript:

```ts
export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

export type DeploymentStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type DeploymentSource = "github_actions" | "manual" | "fixture";

export type TerraformResourceAction =
  | "create"
  | "update"
  | "delete"
  | "replace"
  | "no_op";

export type IacScanner = "checkov" | "tfsec" | "custom";

export type IacFindingStatus = "failed" | "passed" | "skipped" | "unknown";

export type RecommendationStatus =
  | "open"
  | "accepted"
  | "dismissed"
  | "resolved";

export type EvidenceTable =
  | "deployment_runs"
  | "terraform_plans"
  | "terraform_resource_changes"
  | "iac_scan_findings"
  | "anomalies"
  | "insights"
  | "recommendations";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  defaultEnvironment: string;
  createdAt: string;
  updatedAt: string;
  repositoryUrl?: string;
}

export interface DeploymentRun {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  status: DeploymentStatus;
  environment: string;
  source: DeploymentSource;
  startedAt: string;
  commitSha?: string;
  branch?: string;
  externalRunId?: string;
  externalRunUrl?: string;
  completedAt?: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface TerraformResourceChange {
  id: string;
  organizationId: string;
  terraformPlanId: string;
  deploymentRunId: string;
  address: string;
  type: string;
  name: string;
  actions: TerraformResourceAction[];
  providerName?: string;
  moduleAddress?: string;
  riskFlags?: string[];
  evidencePath?: string;
  changeSummary?: string;
}

export interface TerraformPlanSummary {
  id: string;
  organizationId: string;
  deploymentRunId: string;
  creates: number;
  updates: number;
  deletes: number;
  replacements: number;
  riskyResourceCount: number;
  iamChangeCount: number;
  networkingChangeCount: number;
  publicExposureCount: number;
  resourceChanges: TerraformResourceChange[];
}

export interface IacScanFinding {
  id: string;
  organizationId: string;
  deploymentRunId: string;
  scanner: IacScanner;
  status: IacFindingStatus;
  severity: Severity;
  checkId: string;
  title: string;
  evidenceRefs: string[];
  resource?: string;
  filePath?: string;
  guideline?: string;
}

export interface Anomaly {
  id: string;
  organizationId: string;
  deploymentRunId: string;
  severity: Severity;
  title: string;
  summary: string;
  evidenceRefs: string[];
  detectedAt: string;
  category?: string;
}

export interface Insight {
  id: string;
  organizationId: string;
  deploymentRunId: string;
  severity: Severity;
  title: string;
  summary: string;
  evidenceRefs: string[];
  createdAt: string;
  model?: string;
  structuredOutput?: Record<string, unknown>;
}

export interface Recommendation {
  id: string;
  organizationId: string;
  deploymentRunId: string;
  severity: Severity;
  title: string;
  summary: string;
  evidenceRefs: string[];
  status: RecommendationStatus;
  createdAt: string;
}

export interface EvidenceLink {
  id: string;
  organizationId: string;
  deploymentRunId?: string;
  sourceTable: EvidenceTable;
  sourceId: string;
  targetTable: EvidenceTable;
  targetId: string;
  createdAt: string;
  label?: string;
  metadata?: Record<string, unknown>;
}
```

- [ ] **Step 2: Run the package typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: exits successfully with no TypeScript errors.

- [ ] **Step 3: Run existing package tests**

Run:

```powershell
pnpm test
```

Expected: existing analyzer placeholder test passes.

- [ ] **Step 4: Commit type alignment**

Run:

```powershell
git add packages/core/src/index.ts
git commit -m "Align shared types with Phase 1 schema"
```

Expected: commit succeeds.

## Task 4: Document The Supabase Schema

**Files:**

- Create: `docs/SUPABASE_SCHEMA.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Create the schema documentation**

Create `docs/SUPABASE_SCHEMA.md` with this Markdown:

````md
# Supabase Schema

## Purpose

Phase 1 gives ADIA a secure database foundation for deployment visibility. The schema stores organizations, projects, deployment runs, Terraform evidence, IaC scan findings, deterministic anomalies, insights, recommendations, and evidence links.

This phase does not add ingestion APIs, parser execution, LLM generation, or live dashboard queries.

## Tenant Model

Organizations are the tenant boundary. Projects belong to one organization, and deployment evidence rows include `organization_id` so RLS policies can filter rows directly.

The role model is intentionally simple:

- `owner`: can manage organization data and delete organization membership rows.
- `admin`: can manage project and evidence data.
- `member`: can read organization data.
- `viewer`: can read organization data.

Future service-side ingestion may use the Supabase service role from server-only code. The service role key must never be exposed to the browser.

## Table Groups

- Identity and scope: `organizations`, `organization_members`, `projects`.
- Deployment evidence: `deployment_runs`, `terraform_plans`, `terraform_resource_changes`, `iac_scan_findings`.
- Analysis output: `anomalies`, `insights`, `recommendations`.
- Traceability: `evidence_links`.

## RLS Summary

Every application table has RLS enabled.

Authenticated organization members can read rows in their organization. Owners and admins can insert, update, and delete organization-scoped rows. Members and viewers do not get direct write policies in Phase 1.

Membership checks use security-definer helper functions:

- `is_org_member(org_id uuid)`
- `has_org_role(org_id uuid, allowed_roles organization_role[])`

These functions are used inside policies to avoid recursive policy checks on the membership table.

## Consistency Guards

The migration adds triggers that reject rows when duplicated organization IDs do not match their parent records:

- Deployment runs must belong to the same organization as their project.
- Terraform plans, findings, anomalies, insights, and recommendations must belong to the same organization as their deployment run.
- Terraform resource changes must match their plan, deployment run, and organization.
- Evidence links with a deployment run must match that run's organization.

## Seed Data

`supabase/seed.sql` creates one demo organization, one demo project, three demo deployment runs, one Terraform plan summary, two Terraform resource changes, two Checkov-style findings, one anomaly, one static insight, two recommendations, and evidence links.

The seeded insight is static fixture data. It is not generated by an LLM.

## Local Validation

Run the normal workspace checks:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm format
pnpm build
```
````

If the Supabase CLI is installed and local services are configured, run:

```powershell
supabase db reset
```

After creating a local Supabase Auth user, attach that user to the demo organization with the commented SQL at the bottom of `supabase/seed.sql`.

````

- [ ] **Step 2: Update architecture documentation**

Append this section to `docs/ARCHITECTURE.md`:

```md

## Phase 1 Schema Foundation

Phase 1 adds the planned Supabase data foundation behind the architecture pipeline. Organizations define tenant boundaries, projects group deployment visibility, and deployment runs anchor Terraform plan evidence, IaC scan findings, anomalies, insights, recommendations, and evidence links.

The schema is intentionally advisory and evidence-first. It does not execute deployments, run Terraform, or call LLM providers. Those behaviors remain outside Phase 1.
````

- [ ] **Step 3: Run documentation format check**

Run:

```powershell
pnpm format
```

Expected: exits successfully.

- [ ] **Step 4: Commit documentation**

Run:

```powershell
git add docs/SUPABASE_SCHEMA.md docs/ARCHITECTURE.md
git commit -m "Document Phase 1 Supabase schema"
```

Expected: commit succeeds.

## Task 5: Validate SQL Locally When Tooling Exists

**Files:**

- Read: `supabase/migrations/0001_phase_1_schema.sql`
- Read: `supabase/seed.sql`

- [ ] **Step 1: Check for Supabase CLI**

Run:

```powershell
Get-Command supabase
```

Expected:

- If installed, PowerShell prints the command path.
- If missing, PowerShell reports that `supabase` is not recognized.

- [ ] **Step 2: Reset local Supabase database when CLI is available**

Run this only when Step 1 finds the Supabase CLI:

```powershell
supabase db reset
```

Expected: local database resets and applies the migration and seed file.

- [ ] **Step 3: Record missing Supabase CLI in final notes when unavailable**

If the CLI is unavailable, do not install it during this task. Include this in the completion notes:

```text
Supabase CLI was not installed locally, so migration SQL was reviewed but not applied with supabase db reset.
```

## Task 6: Run Full Workspace Verification

**Files:**

- Read: `package.json`
- Read: all changed files

- [ ] **Step 1: Run TypeScript checks**

Run:

```powershell
pnpm typecheck
```

Expected: exits successfully.

- [ ] **Step 2: Run tests**

Run:

```powershell
pnpm test
```

Expected: exits successfully and includes the existing analyzer test.

- [ ] **Step 3: Run lint**

Run:

```powershell
pnpm lint
```

Expected: exits successfully.

- [ ] **Step 4: Run format check**

Run:

```powershell
pnpm format
```

Expected: exits successfully.

- [ ] **Step 5: Run build**

Run:

```powershell
pnpm build
```

Expected: exits successfully.

- [ ] **Step 6: Scan filenames for date-like names**

Run:

```powershell
rg --files | Select-String -Pattern '(^|[\\/])(?:19|20)[0-9]{6}[_-]|[0-9]{4}-[0-9]{2}-[0-9]{2}'
```

Expected: no output.

- [ ] **Step 7: Commit verification cleanup if formatting changed files**

Run only if `git status --short` shows formatting changes:

```powershell
git add .
git commit -m "Apply Phase 1 formatting"
```

Expected: commit succeeds only when formatting produced tracked file changes.

## Task 7: Final Review And Push

**Files:**

- Read: `git status --short`
- Read: `git log --oneline -5`

- [ ] **Step 1: Review changed files**

Run:

```powershell
git status --short
```

Expected: only intended Phase 1 files are changed before the final commit, or the worktree is clean after commits.

- [ ] **Step 2: Push the branch**

Run:

```powershell
git push origin main
```

Expected: push succeeds.

- [ ] **Step 3: Prepare completion summary**

Include these items in the final response:

```text
Created the Phase 1 Supabase migration, seed data, shared type updates, and schema docs.
Verified with pnpm typecheck, pnpm test, pnpm lint, pnpm format, and pnpm build.
Reported whether supabase db reset was available locally.
Confirmed no date-like filenames were introduced.
```

## Self-Review Checklist

- [ ] The migration creates all Phase 1 enums, tables, constraints, indexes, triggers, helper functions, and RLS policies from the schema design.
- [ ] Seed data covers the demo organization, project, deployment runs, Terraform plan, resource changes, IaC findings, anomaly, insight, recommendations, and evidence links.
- [ ] Shared types include organization, organization membership, project, and evidence link concepts.
- [ ] Documentation explains tenant boundaries, RLS, seed data, and validation.
- [ ] No ingestion, parser, anomaly engine, LLM, Supabase Edge Function, or live dashboard wiring is added.
- [ ] No service role key, LLM key, cloud credential, or real resource definition is committed.
- [ ] No filename contains a date or timestamp.
