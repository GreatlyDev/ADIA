alter table public.terraform_plans
add column if not exists source_evidence_file_id uuid references public.raw_evidence_files(id) on delete set null,
add column if not exists parser_version text not null default 'legacy',
add column if not exists source_content_sha256 text;

alter table public.terraform_resource_changes
add column if not exists parser_version text not null default 'legacy',
add column if not exists fingerprint text;

alter table public.iac_scan_findings
add column if not exists source_evidence_file_id uuid references public.raw_evidence_files(id) on delete set null,
add column if not exists parser_version text not null default 'legacy',
add column if not exists source_content_sha256 text,
add column if not exists fingerprint text,
add column if not exists evidence_refs text[] not null default '{}'::text[];

update public.evidence_links
set label = 'related'
where label is null;

alter table public.evidence_links
alter column label set default 'related',
alter column label set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'terraform_plans_parser_version_present'
      and conrelid = 'public.terraform_plans'::regclass
  ) then
    alter table public.terraform_plans
    add constraint terraform_plans_parser_version_present
    check (length(btrim(parser_version)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'terraform_plans_source_sha256_format'
      and conrelid = 'public.terraform_plans'::regclass
  ) then
    alter table public.terraform_plans
    add constraint terraform_plans_source_sha256_format
    check (source_content_sha256 is null or source_content_sha256 ~ '^[a-f0-9]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'terraform_resource_changes_parser_version_present'
      and conrelid = 'public.terraform_resource_changes'::regclass
  ) then
    alter table public.terraform_resource_changes
    add constraint terraform_resource_changes_parser_version_present
    check (length(btrim(parser_version)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'terraform_resource_changes_fingerprint_format'
      and conrelid = 'public.terraform_resource_changes'::regclass
  ) then
    alter table public.terraform_resource_changes
    add constraint terraform_resource_changes_fingerprint_format
    check (fingerprint is null or fingerprint ~ '^[a-f0-9]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'iac_scan_findings_parser_version_present'
      and conrelid = 'public.iac_scan_findings'::regclass
  ) then
    alter table public.iac_scan_findings
    add constraint iac_scan_findings_parser_version_present
    check (length(btrim(parser_version)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'iac_scan_findings_source_sha256_format'
      and conrelid = 'public.iac_scan_findings'::regclass
  ) then
    alter table public.iac_scan_findings
    add constraint iac_scan_findings_source_sha256_format
    check (source_content_sha256 is null or source_content_sha256 ~ '^[a-f0-9]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'iac_scan_findings_fingerprint_format'
      and conrelid = 'public.iac_scan_findings'::regclass
  ) then
    alter table public.iac_scan_findings
    add constraint iac_scan_findings_fingerprint_format
    check (fingerprint is null or fingerprint ~ '^[a-f0-9]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'evidence_links_label_present'
      and conrelid = 'public.evidence_links'::regclass
  ) then
    alter table public.evidence_links
    add constraint evidence_links_label_present
    check (length(btrim(label)) > 0);
  end if;
end $$;

create or replace function public.assert_parser_source_evidence_matches()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_kind text;
  expected_format text;
  source_evidence_id uuid;
begin
  if tg_table_name = 'terraform_plans' then
    expected_kind := 'terraform_plan';
    expected_format := 'terraform_show_json';
    source_evidence_id := new.source_evidence_file_id;
  elsif tg_table_name = 'iac_scan_findings' then
    expected_kind := 'iac_scan';
    expected_format := 'checkov_json';
    source_evidence_id := new.source_evidence_file_id;
  else
    return new;
  end if;

  if source_evidence_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.raw_evidence_files
    where id = source_evidence_id
      and organization_id = new.organization_id
      and deployment_run_id = new.deployment_run_id
      and kind = expected_kind
      and format = expected_format
  ) then
    raise exception 'source_evidence_file_id must reference matching raw evidence for this run';
  end if;

  return new;
end;
$$;

drop trigger if exists terraform_plans_source_evidence_guard on public.terraform_plans;
create trigger terraform_plans_source_evidence_guard
before insert or update on public.terraform_plans
for each row execute function public.assert_parser_source_evidence_matches();

drop trigger if exists iac_scan_findings_source_evidence_guard on public.iac_scan_findings;
create trigger iac_scan_findings_source_evidence_guard
before insert or update on public.iac_scan_findings
for each row execute function public.assert_parser_source_evidence_matches();

create index if not exists terraform_plans_source_evidence_idx
on public.terraform_plans (source_evidence_file_id)
where source_evidence_file_id is not null;

create unique index if not exists terraform_plans_run_source_parser_unique_idx
on public.terraform_plans (deployment_run_id, source_evidence_file_id, parser_version);

create unique index if not exists terraform_resource_changes_plan_fingerprint_unique_idx
on public.terraform_resource_changes (terraform_plan_id, fingerprint);

create index if not exists iac_scan_findings_source_evidence_idx
on public.iac_scan_findings (source_evidence_file_id)
where source_evidence_file_id is not null;

create unique index if not exists iac_scan_findings_run_source_scanner_fingerprint_unique_idx
on public.iac_scan_findings (deployment_run_id, source_evidence_file_id, scanner, fingerprint);

create unique index if not exists evidence_links_unique_idx
on public.evidence_links (
  organization_id,
  source_table,
  source_id,
  target_table,
  target_id,
  label
);
