# Phase 2 Ingestion Contract Design

## Purpose

Phase 2 defines ADIA's ingestion contract before connecting ingestion to Supabase or live webhooks. The goal is to establish a safe, testable fixture replay path for one deployment run at a time.

This phase creates TypeScript contract types, runtime validation helpers, realistic fixture files, and a local demo script that validates fixtures and prints a normalized summary. It does not persist data, expose API routes, parse Terraform or Checkov payloads, analyze anomalies, call LLM providers, or execute infrastructure commands.

## Design Goals

- Represent one deployment run per ingestion fixture file.
- Use a broader ingestion envelope that can reference Terraform plan JSON, Checkov JSON, and log evidence without parsing those files yet.
- Keep reusable contracts and validation helpers in `packages/core`.
- Keep `scripts/ingest-demo.ts` thin and focused on local fixture replay.
- Validate input shape and safety constraints before any future persistence work.
- Keep fixture paths relative and contained inside `scripts/fixtures`.
- Preserve ADIA's safety boundary: analyze and recommend later, never execute infrastructure actions.

## Non-Goals

- No Supabase client or service-role access.
- No database writes.
- No webhook receiver or Next.js API route.
- No Terraform plan parsing.
- No Checkov parsing.
- No log parsing.
- No deterministic anomaly detection.
- No LLM insight generation.
- No autonomous remediation.
- No `terraform apply` or cloud-provider execution.

## Ingestion Envelope

Each fixture file represents exactly one deployment run. The envelope is intentionally shallow: it stores run metadata and references evidence files by relative path.

```ts
interface IngestionEnvelope {
  schemaVersion: "adia.ingestion.v1";
  source: "github_actions" | "manual" | "fixture";
  organizationSlug: string;
  projectSlug: string;
  run: IngestionRun;
  evidence: IngestionEvidence;
  metadata?: Record<string, unknown>;
}
```

### `IngestionRun`

```ts
interface IngestionRun {
  externalRunId: string;
  name: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  environment: string;
  startedAt: string;
  completedAt?: string;
  branch?: string;
  commitSha?: string;
  externalRunUrl?: string;
}
```

### `IngestionEvidence`

```ts
interface IngestionEvidence {
  terraformPlan?: {
    path: string;
    format: "terraform_show_json";
  };
  iacScan?: {
    path: string;
    scanner: "checkov";
    format: "checkov_json";
  };
  logs?: Array<{
    path: string;
    label: string;
    format: "plain_text";
  }>;
}
```

## Validation Rules

Runtime validation will return a structured result instead of throwing for expected invalid input.

Validation will require:

- `schemaVersion` equals `adia.ingestion.v1`.
- `source` is one of `github_actions`, `manual`, or `fixture`.
- `organizationSlug` and `projectSlug` are lowercase dashed slugs.
- `run.externalRunId`, `run.name`, and `run.environment` are non-empty strings.
- `run.status` is one of the known deployment statuses.
- `run.startedAt` is a valid date string.
- `run.completedAt`, when present, is a valid date string.
- `run.completedAt`, when present, is not earlier than `run.startedAt`.
- Optional `branch`, `commitSha`, and `externalRunUrl` are strings when present.
- `evidence.terraformPlan.format`, when present, is `terraform_show_json`.
- `evidence.iacScan.scanner`, when present, is `checkov`.
- `evidence.iacScan.format`, when present, is `checkov_json`.
- `evidence.logs[*].format`, when present, is `plain_text`.
- Every evidence path is a safe relative path.
- Evidence paths cannot be absolute paths.
- Evidence paths cannot contain parent-directory traversal.
- Evidence paths cannot be empty.

Evidence file contents are not parsed in Phase 2. The demo script will only check that referenced files exist.

## File Responsibilities

### `packages/core/src/ingestion.ts`

Owns the reusable ingestion contract:

- Ingestion envelope types.
- Evidence attachment types.
- Validation issue type.
- Validation result type.
- `validateIngestionEnvelope(input: unknown)` helper.
- `isSafeFixturePath(path: string)` helper.
- `summarizeIngestionEnvelope(envelope: IngestionEnvelope)` helper for script output.

The module will not import Supabase, filesystem APIs, Terraform tooling, Checkov tooling, or LLM libraries.

### `packages/core/src/index.ts`

Re-exports ingestion contract types and helpers so future packages and app routes can consume them from `@adia/core`.

### `packages/core/test/ingestion.test.ts`

Covers the contract behavior:

- Valid envelope passes.
- Invalid schema version fails.
- Invalid organization or project slug fails.
- Invalid status fails.
- Invalid timestamp fails.
- `completedAt` before `startedAt` fails.
- Absolute evidence path fails.
- Parent-directory evidence path fails.
- Valid relative evidence paths pass.

### `scripts/fixtures/github-actions/*.json`

Stores one-run ingestion envelope fixtures. The initial fixture will model a GitHub Actions deployment run with evidence references.

Fixture filenames must not contain dates.

### `scripts/fixtures/terraform-plans/*.json`

Stores small Terraform `terraform show -json` style fixture files referenced by ingestion envelopes. These files are raw evidence placeholders and will not be parsed in Phase 2.

### `scripts/fixtures/checkov/*.json`

Stores small Checkov-style JSON fixture files referenced by ingestion envelopes. These files are raw evidence placeholders and will not be parsed in Phase 2.

### `scripts/fixtures/logs/*.log`

Stores plain-text demo log snippets referenced by ingestion envelopes. These files are raw evidence placeholders and will not be parsed in Phase 2.

### `scripts/ingest-demo.ts`

Loads one ingestion envelope fixture from disk, validates it, verifies referenced evidence files exist, and prints a normalized summary.

The script will:

- Accept a fixture path argument.
- Default to a sample GitHub Actions fixture when no argument is provided.
- Resolve evidence paths relative to `scripts/fixtures`.
- Refuse unsafe evidence paths.
- Print validation issues in a readable list.
- Exit with a nonzero code when validation or evidence existence checks fail.
- Avoid reading secrets from the environment.
- Avoid writing to Supabase.

## Example Fixture Shape

```json
{
  "schemaVersion": "adia.ingestion.v1",
  "source": "github_actions",
  "organizationSlug": "adia-demo-org",
  "projectSlug": "adia-demo-service",
  "run": {
    "externalRunId": "gh-run-demo-001",
    "name": "Deploy staging from GitHub Actions",
    "status": "succeeded",
    "environment": "staging",
    "branch": "main",
    "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "externalRunUrl": "https://github.com/GreatlyDev/ADIA/actions/runs/1001",
    "startedAt": "2026-01-15T14:00:00.000Z",
    "completedAt": "2026-01-15T14:08:00.000Z"
  },
  "evidence": {
    "terraformPlan": {
      "path": "terraform-plans/demo-plan.json",
      "format": "terraform_show_json"
    },
    "iacScan": {
      "path": "checkov/demo-checkov.json",
      "scanner": "checkov",
      "format": "checkov_json"
    },
    "logs": [
      {
        "path": "logs/deploy-staging.log",
        "label": "deploy job",
        "format": "plain_text"
      }
    ]
  },
  "metadata": {
    "workflow": "deploy",
    "job": "staging"
  }
}
```

Content timestamps are allowed in fixtures. Filenames must not contain dates.

## Demo Script Output

The script output should be human-readable and portfolio-friendly:

```text
ADIA ingestion fixture validated
Organization: adia-demo-org
Project: adia-demo-service
Run: Deploy staging from GitHub Actions
Status: succeeded
Evidence:
- Terraform plan: terraform-plans/demo-plan.json
- IaC scan: checkov/demo-checkov.json
- Log: logs/deploy-staging.log
```

The output must not imply the fixture was persisted, parsed, analyzed, or summarized by an LLM.

## Testing Strategy

Phase 2 will use Vitest in `packages/core` for validation tests. Tests should exercise invalid payloads directly instead of relying on filesystem fixtures.

The script will be smoke-tested by running:

```powershell
pnpm exec tsx scripts/ingest-demo.ts
```

Workspace validation remains:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm format
pnpm build
```

## Safety Principles

- Treat all ingestion input as untrusted.
- Validate before any future persistence.
- Keep file paths relative to the fixture root.
- Reject absolute paths and parent-directory traversal.
- Do not read service-role keys or LLM keys.
- Do not connect to Supabase in Phase 2.
- Do not parse Terraform or Checkov data in Phase 2.
- Do not execute infrastructure commands.

## Definition of Done

Phase 2 is complete when:

- `packages/core` exports ingestion envelope types and validation helpers.
- Unit tests cover valid and invalid ingestion envelopes.
- Fixture files demonstrate one run per ingestion envelope.
- `scripts/ingest-demo.ts` validates a fixture and checks referenced evidence exists.
- The demo script prints a clear summary without persistence or analysis claims.
- Documentation or README updates explain how to run the fixture demo.
- No Supabase writes, webhook routes, parser logic, LLM calls, or Terraform execution are added.
- No filename contains a date.
- All available workspace checks pass.
