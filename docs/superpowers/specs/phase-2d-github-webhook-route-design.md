# Phase 2D GitHub Webhook Route Design

## Goal

Phase 2D adds a server-side GitHub `workflow_run` webhook route that verifies GitHub signatures, maps trusted event bodies through the existing GitHub Actions adapter, and can return a dry-run ADIA ingestion envelope for local validation.

## Scope

This phase implements transport validation and mapping only:

- Verify `X-Hub-Signature-256` using `GITHUB_WEBHOOK_SECRET`.
- Accept signed `workflow_run` events.
- Ignore other signed GitHub event types.
- Parse the raw request body only after signature verification.
- Map the validated event through `githubWorkflowRunEventToIngestionEnvelope`.
- Return a dry-run response with the generated envelope when `dryRun=true`.
- Return a non-persistent accepted response otherwise.

This phase does not persist webhook results to Supabase, parse Terraform or Checkov evidence, call an LLM provider, execute Terraform, run cloud commands, or trigger remediation.

## Adapter Context

GitHub workflow-run events do not contain trusted ADIA tenant context or fixture evidence paths. The route loads that context from server-side environment variables:

- `ADIA_GITHUB_WEBHOOK_ORGANIZATION_SLUG`
- `ADIA_GITHUB_WEBHOOK_PROJECT_SLUG`
- `ADIA_GITHUB_WEBHOOK_ENVIRONMENT`
- `ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON`

The evidence JSON must be an array of ADIA ingestion evidence references. The existing ingestion envelope validator remains the final authority for evidence path safety and envelope shape.

## Route

The Next.js route will live at:

```text
POST /api/ingest/github/workflow-run
```

The route runs in the Node.js runtime because HMAC verification uses Node `crypto`.

## Responses

- `200`: dry-run mapping succeeded and includes the generated envelope.
- `202`: signed non-`workflow_run` event ignored, or workflow-run mapped without persistence.
- `400`: invalid JSON body after signature verification.
- `401`: missing or invalid GitHub signature.
- `422`: valid GitHub request mapped to an invalid ADIA envelope or missing required workflow-run fields.
- `500`: missing or invalid server-side webhook configuration.

## Testing

Tests live in `packages/ingestion` so the security and mapping behavior can be tested without booting Next.js. The Next route stays thin and delegates to those tested helpers.
