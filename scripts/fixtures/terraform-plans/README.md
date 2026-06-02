# Terraform Plan Fixtures

Future phases will store sanitized `terraform show -json` output here.

Expected fixture examples:

- Safe create-only plan.
- Update-heavy plan.
- Replacement plan.
- IAM policy change.
- Networking/security group change.
- Public exposure risk example.

Fixtures should be small enough for tests and demos. Do not include real account IDs, secrets, private IPs, or sensitive resource names.
