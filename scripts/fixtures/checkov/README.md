# Checkov Fixtures

This directory stores sanitized Checkov JSON output for fixture-first parser development.

Expected fixture examples:

- Passing scan.
- Scan with low and medium findings.
- Scan with high or critical findings.
- Findings tied to Terraform resource addresses.

Fixtures should support parser tests without requiring real cloud credentials.

Phase 3B uses `demo-checkov.json` to exercise deterministic Checkov finding parsing for failed, passed, skipped, and unknown checks. Parser output is not persisted to Supabase yet.
