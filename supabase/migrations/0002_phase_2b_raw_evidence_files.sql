create unique index if not exists deployment_runs_external_run_unique_idx
on public.deployment_runs (organization_id, project_id, source, external_run_id);

create table if not exists public.raw_evidence_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deployment_run_id uuid not null references public.deployment_runs(id) on delete cascade,
  kind text not null,
  format text not null,
  path text not null,
  label text,
  size_bytes integer,
  content_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_evidence_files_kind_allowed check (
    kind in ('terraform_plan', 'iac_scan', 'log')
  ),
  constraint raw_evidence_files_format_allowed check (
    format in ('terraform_show_json', 'checkov_json', 'plain_text')
  ),
  constraint raw_evidence_files_size_nonnegative check (
    size_bytes is null or size_bytes >= 0
  ),
  constraint raw_evidence_files_sha256_format check (
    content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint raw_evidence_files_safe_path check (
    length(path) > 0
    and path = btrim(path)
    and path not like '/%'
    and position(E'\\' in path) = 0
    and position('..' in path) = 0
    and position('//' in path) = 0
    and position('://' in path) = 0
    and path !~ '^[A-Za-z]:'
  )
);

create unique index if not exists raw_evidence_files_run_path_idx
on public.raw_evidence_files (deployment_run_id, path);

create index if not exists raw_evidence_files_org_idx
on public.raw_evidence_files (organization_id);

create index if not exists raw_evidence_files_run_idx
on public.raw_evidence_files (deployment_run_id);

create index if not exists raw_evidence_files_kind_idx
on public.raw_evidence_files (kind);

drop trigger if exists raw_evidence_files_set_updated_at on public.raw_evidence_files;
create trigger raw_evidence_files_set_updated_at
before update on public.raw_evidence_files
for each row execute function public.set_updated_at();

drop trigger if exists raw_evidence_files_run_org_guard on public.raw_evidence_files;
create trigger raw_evidence_files_run_org_guard
before insert or update on public.raw_evidence_files
for each row execute function public.assert_run_org_matches();

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
    when 'raw_evidence_files' then
      return exists (
        select 1
        from public.raw_evidence_files
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

alter table public.evidence_links
drop constraint if exists evidence_links_source_table_allowed;

alter table public.evidence_links
add constraint evidence_links_source_table_allowed check (
  source_table in (
    'deployment_runs',
    'raw_evidence_files',
    'terraform_plans',
    'terraform_resource_changes',
    'iac_scan_findings',
    'anomalies',
    'insights',
    'recommendations'
  )
);

alter table public.evidence_links
drop constraint if exists evidence_links_target_table_allowed;

alter table public.evidence_links
add constraint evidence_links_target_table_allowed check (
  target_table in (
    'deployment_runs',
    'raw_evidence_files',
    'terraform_plans',
    'terraform_resource_changes',
    'iac_scan_findings',
    'anomalies',
    'insights',
    'recommendations'
  )
);

alter table public.raw_evidence_files enable row level security;

drop policy if exists "Members can read raw evidence files" on public.raw_evidence_files;
create policy "Members can read raw evidence files"
on public.raw_evidence_files
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "Admins can insert raw evidence files" on public.raw_evidence_files;
create policy "Admins can insert raw evidence files"
on public.raw_evidence_files
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can update raw evidence files" on public.raw_evidence_files;
create policy "Admins can update raw evidence files"
on public.raw_evidence_files
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

drop policy if exists "Admins can delete raw evidence files" on public.raw_evidence_files;
create policy "Admins can delete raw evidence files"
on public.raw_evidence_files
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));
