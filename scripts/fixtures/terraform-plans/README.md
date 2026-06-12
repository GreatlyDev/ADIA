# Terraform Plan Fixtures

This directory stores sanitized `terraform show -json` output for fixture-first parser development.

Expected fixture examples:

- Safe create-only plan.
- Update-heavy plan.
- Replacement plan.
- IAM policy change.
- Networking/security group change.
- Public exposure risk example.

Fixtures should be small enough for tests and demos. Do not include real account IDs, secrets, private IPs, or sensitive resource names.

Phase 3A uses `demo-plan.json` to exercise deterministic Terraform summary parsing. Parser output is not persisted to Supabase yet.
