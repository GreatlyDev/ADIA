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
