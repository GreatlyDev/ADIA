-- Phase 4C schema readiness only.
-- Actual anomaly write orchestration is intentionally left for a later phase.

alter table public.anomalies
add column if not exists anomaly_engine_version text not null default 'legacy',
add column if not exists fingerprint text,
add column if not exists evidence_refs text[] not null default '{}'::text[],
add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'anomalies_engine_version_present'
      and conrelid = 'public.anomalies'::regclass
  ) then
    alter table public.anomalies
    add constraint anomalies_engine_version_present
    check (length(btrim(anomaly_engine_version)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'anomalies_fingerprint_format'
      and conrelid = 'public.anomalies'::regclass
  ) then
    alter table public.anomalies
    add constraint anomalies_fingerprint_format
    check (fingerprint is null or fingerprint ~ '^[a-f0-9]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'anomalies_evidence_refs_no_nulls'
      and conrelid = 'public.anomalies'::regclass
  ) then
    alter table public.anomalies
    add constraint anomalies_evidence_refs_no_nulls
    check (array_position(evidence_refs, null) is null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'anomalies_metadata_is_object'
      and conrelid = 'public.anomalies'::regclass
  ) then
    alter table public.anomalies
    add constraint anomalies_metadata_is_object
    check (jsonb_typeof(metadata) = 'object');
  end if;
end $$;

create unique index if not exists anomalies_run_engine_fingerprint_unique_idx
on public.anomalies (deployment_run_id, anomaly_engine_version, fingerprint)
where fingerprint is not null;

create index if not exists anomalies_run_engine_idx
on public.anomalies (deployment_run_id, anomaly_engine_version);

create index if not exists anomalies_run_category_idx
on public.anomalies (deployment_run_id, category)
where category is not null;

create index if not exists anomalies_run_severity_idx
on public.anomalies (deployment_run_id, severity);

create index if not exists anomalies_fingerprint_idx
on public.anomalies (fingerprint)
where fingerprint is not null;

comment on column public.anomalies.anomaly_engine_version is
'Deterministic anomaly engine version used to generate this anomaly.';

comment on column public.anomalies.fingerprint is
'Stable replay fingerprint for duplicate-safe anomaly upserts.';

comment on column public.anomalies.evidence_refs is
'Normalized Phase 4A evidence references used to generate this anomaly.';

comment on column public.anomalies.metadata is
'Compact server-generated anomaly persistence metadata; not raw evidence or LLM output.';
