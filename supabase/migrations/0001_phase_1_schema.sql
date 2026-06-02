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
