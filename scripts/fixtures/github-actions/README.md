# GitHub Actions Fixtures

This directory stores sanitized GitHub Actions examples for fixture-first ingestion development.

Current fixtures:

- `deploy-staging.json`: an ADIA ingestion envelope for one deployment run.
- `workflow-run-event.json`: a sanitized GitHub `workflow_run` event that the Phase 2C adapter can map into an ADIA ingestion envelope.

Future examples may include failed workflow runs, canceled runs, artifact metadata, and job-level log metadata.

Do not place real secrets, tokens, private repository data, or raw production logs in fixtures.
