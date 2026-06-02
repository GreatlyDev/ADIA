# Local placeholder modules are wired so `terraform validate` can exercise the
# repo structure without cloud credentials or resource creation.

module "supabase_project" {
  source = "../../modules/supabase_project"
}

module "demo_aws_stack" {
  source = "../../modules/demo_aws_stack"
}

