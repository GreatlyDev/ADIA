# Phase 2 Ingestion Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ADIA's fixture-only ingestion contract with runtime validation, sample evidence fixtures, a local replay script, and documentation.

**Architecture:** `packages/core` owns the reusable ingestion types and validation helpers. `scripts/ingest-demo.ts` loads one fixture envelope, validates it, checks referenced evidence files exist under `scripts/fixtures`, and prints a summary without writing to Supabase or parsing evidence contents.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, tsx, Node.js filesystem APIs.

---

## File Structure

- Modify: `packages/core/package.json`
  - Add a `test` script and Vitest dev dependency for core contract tests.
- Modify: `packages/core/tsconfig.json`
  - Include `test/**/*.ts` and Vitest types.
- Create: `packages/core/src/ingestion.ts`
  - Defines ingestion envelope types, validation result types, path safety helper, envelope validator, and summary helper.
- Modify: `packages/core/src/index.ts`
  - Re-export ingestion types and helpers.
- Create: `packages/core/test/ingestion.test.ts`
  - Covers valid envelope behavior, invalid values, timestamp ordering, and unsafe evidence paths.
- Modify: `pnpm-lock.yaml`
  - Updated by pnpm after adding Vitest to `@adia/core`.
- Create: `scripts/fixtures/github-actions/deploy-staging.json`
  - One GitHub Actions style ingestion envelope fixture.
- Create: `scripts/fixtures/terraform-plans/demo-plan.json`
  - Small raw Terraform `terraform show -json` style evidence fixture.
- Create: `scripts/fixtures/checkov/demo-checkov.json`
  - Small Checkov-style raw evidence fixture.
- Create: `scripts/fixtures/logs/deploy-staging.log`
  - Plain-text deployment log fixture.
- Modify: `scripts/ingest-demo.ts`
  - Replace the Phase 0 placeholder with a local fixture validation and summary script.
- Create: `docs/INGESTION_FIXTURES.md`
  - Explain the Phase 2 fixture contract and demo command.
- Modify: `README.md`
  - Add a short command reference for the Phase 2 fixture ingestion demo.

## Scope Boundaries

Phase 2 implements contracts and fixture replay only.

- No Supabase client.
- No database writes.
- No webhook receiver.
- No Next.js API route.
- No Terraform plan parsing.
- No Checkov parsing.
- No log parsing.
- No anomaly engine logic.
- No LLM calls.
- No infrastructure command execution.

## Task 1: Add Core Contract Test Harness

**Files:**

- Modify: `packages/core/package.json`
- Modify: `packages/core/tsconfig.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Update `packages/core/package.json`**

Replace `packages/core/package.json` with:

```json
{
  "name": "@adia/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Update `packages/core/tsconfig.json`**

Replace `packages/core/tsconfig.json` with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Update the pnpm lockfile**

Run:

```powershell
pnpm install --lockfile-only
```

Expected: `pnpm-lock.yaml` updates the `packages/core` importer with `vitest`.

- [ ] **Step 4: Commit test harness setup**

Run:

```powershell
git add packages/core/package.json packages/core/tsconfig.json pnpm-lock.yaml
git commit -m "Add core package test harness"
```

Expected: commit succeeds.

## Task 2: Add Ingestion Contract Tests

**Files:**

- Create: `packages/core/test/ingestion.test.ts`

- [ ] **Step 1: Create the failing tests**

Create `packages/core/test/ingestion.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  isSafeFixturePath,
  summarizeIngestionEnvelope,
  validateIngestionEnvelope,
  type IngestionEnvelope,
} from "../src/ingestion";

function validEnvelope(): IngestionEnvelope {
  return {
    schemaVersion: "adia.ingestion.v1",
    source: "github_actions",
    organizationSlug: "adia-demo-org",
    projectSlug: "adia-demo-service",
    run: {
      externalRunId: "gh-run-demo-001",
      name: "Deploy staging from GitHub Actions",
      status: "succeeded",
      environment: "staging",
      branch: "main",
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      externalRunUrl: "https://github.com/GreatlyDev/ADIA/actions/runs/1001",
      startedAt: "2026-01-15T14:00:00.000Z",
      completedAt: "2026-01-15T14:08:00.000Z",
    },
    evidence: {
      terraformPlan: {
        path: "terraform-plans/demo-plan.json",
        format: "terraform_show_json",
      },
      iacScan: {
        path: "checkov/demo-checkov.json",
        scanner: "checkov",
        format: "checkov_json",
      },
      logs: [
        {
          path: "logs/deploy-staging.log",
          label: "deploy job",
          format: "plain_text",
        },
      ],
    },
    metadata: {
      workflow: "deploy",
      job: "staging",
    },
  };
}

describe("validateIngestionEnvelope", () => {
  it("accepts a valid one-run ingestion envelope", () => {
    const envelope = validEnvelope();

    const result = validateIngestionEnvelope(envelope);

    expect(result).toEqual({
      ok: true,
      value: envelope,
      issues: [],
    });
  });

  it("rejects an unknown schema version", () => {
    const envelope = {
      ...validEnvelope(),
      schemaVersion: "adia.ingestion.v2",
    };

    const result = validateIngestionEnvelope(envelope);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      path: "schemaVersion",
      code: "invalid_literal",
      message: "schemaVersion must be adia.ingestion.v1",
    });
  });

  it("rejects invalid organization and project slugs", () => {
    const envelope = {
      ...validEnvelope(),
      organizationSlug: "ADIA Demo Org",
      projectSlug: "demo_service",
    };

    const result = validateIngestionEnvelope(envelope);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          path: "organizationSlug",
          code: "invalid_slug",
          message: "organizationSlug must be a lowercase dashed slug",
        },
        {
          path: "projectSlug",
          code: "invalid_slug",
          message: "projectSlug must be a lowercase dashed slug",
        },
      ]),
    );
  });

  it("rejects an unknown run status", () => {
    const envelope = {
      ...validEnvelope(),
      run: {
        ...validEnvelope().run,
        status: "blocked",
      },
    };

    const result = validateIngestionEnvelope(envelope);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      path: "run.status",
      code: "invalid_enum",
      message:
        "run.status must be one of queued, running, succeeded, failed, canceled",
    });
  });

  it("rejects invalid timestamps", () => {
    const envelope = {
      ...validEnvelope(),
      run: {
        ...validEnvelope().run,
        startedAt: "not-a-date",
      },
    };

    const result = validateIngestionEnvelope(envelope);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      path: "run.startedAt",
      code: "invalid_date",
      message: "run.startedAt must be a valid date string",
    });
  });

  it("rejects completedAt earlier than startedAt", () => {
    const envelope = {
      ...validEnvelope(),
      run: {
        ...validEnvelope().run,
        startedAt: "2026-01-15T14:08:00.000Z",
        completedAt: "2026-01-15T14:00:00.000Z",
      },
    };

    const result = validateIngestionEnvelope(envelope);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      path: "run.completedAt",
      code: "invalid_date_order",
      message: "run.completedAt must not be earlier than run.startedAt",
    });
  });

  it("rejects unsafe evidence paths", () => {
    const envelope = {
      ...validEnvelope(),
      evidence: {
        terraformPlan: {
          path: "../secrets.json",
          format: "terraform_show_json",
        },
        iacScan: {
          path: "C:\\temp\\checkov.json",
          scanner: "checkov",
          format: "checkov_json",
        },
        logs: [
          {
            path: "",
            label: "empty",
            format: "plain_text",
          },
        ],
      },
    };

    const result = validateIngestionEnvelope(envelope);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          path: "evidence.terraformPlan.path",
          code: "unsafe_path",
          message:
            "evidence.terraformPlan.path must be a safe relative fixture path",
        },
        {
          path: "evidence.iacScan.path",
          code: "unsafe_path",
          message: "evidence.iacScan.path must be a safe relative fixture path",
        },
        {
          path: "evidence.logs[0].path",
          code: "unsafe_path",
          message: "evidence.logs[0].path must be a safe relative fixture path",
        },
      ]),
    );
  });
});

describe("isSafeFixturePath", () => {
  it.each([
    "terraform-plans/demo-plan.json",
    "checkov/demo-checkov.json",
    "logs/deploy-staging.log",
  ])("accepts safe relative path %s", (fixturePath) => {
    expect(isSafeFixturePath(fixturePath)).toBe(true);
  });

  it.each([
    "",
    " logs/deploy-staging.log",
    "../secrets.json",
    "logs/../secrets.log",
    "/tmp/plan.json",
    "\\tmp\\plan.json",
    "C:\\temp\\plan.json",
    "logs//deploy.log",
  ])("rejects unsafe path %s", (fixturePath) => {
    expect(isSafeFixturePath(fixturePath)).toBe(false);
  });
});

describe("summarizeIngestionEnvelope", () => {
  it("returns a compact summary for script output", () => {
    const envelope = validEnvelope();

    expect(summarizeIngestionEnvelope(envelope)).toEqual({
      organizationSlug: "adia-demo-org",
      projectSlug: "adia-demo-service",
      runName: "Deploy staging from GitHub Actions",
      status: "succeeded",
      evidence: [
        {
          kind: "terraform_plan",
          label: "Terraform plan",
          path: "terraform-plans/demo-plan.json",
        },
        {
          kind: "iac_scan",
          label: "IaC scan",
          path: "checkov/demo-checkov.json",
        },
        {
          kind: "log",
          label: "Log",
          path: "logs/deploy-staging.log",
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails before implementation**

Run:

```powershell
pnpm --filter @adia/core test
```

Expected: fails because `../src/ingestion` does not exist.

## Task 3: Implement Core Ingestion Contract

**Files:**

- Create: `packages/core/src/ingestion.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create `packages/core/src/ingestion.ts`**

Create `packages/core/src/ingestion.ts` with:

```ts
export const INGESTION_SCHEMA_VERSION = "adia.ingestion.v1" as const;

export const INGESTION_SOURCES = [
  "github_actions",
  "manual",
  "fixture",
] as const;

export const INGESTION_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;

export type IngestionSchemaVersion = typeof INGESTION_SCHEMA_VERSION;
export type IngestionSource = (typeof INGESTION_SOURCES)[number];
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

export interface TerraformPlanEvidenceRef {
  path: string;
  format: "terraform_show_json";
}

export interface IacScanEvidenceRef {
  path: string;
  scanner: "checkov";
  format: "checkov_json";
}

export interface LogEvidenceRef {
  path: string;
  label: string;
  format: "plain_text";
}

export interface IngestionEvidence {
  terraformPlan?: TerraformPlanEvidenceRef;
  iacScan?: IacScanEvidenceRef;
  logs?: LogEvidenceRef[];
}

export interface IngestionRun {
  externalRunId: string;
  name: string;
  status: IngestionStatus;
  environment: string;
  startedAt: string;
  completedAt?: string;
  branch?: string;
  commitSha?: string;
  externalRunUrl?: string;
}

export interface IngestionEnvelope {
  schemaVersion: IngestionSchemaVersion;
  source: IngestionSource;
  organizationSlug: string;
  projectSlug: string;
  run: IngestionRun;
  evidence: IngestionEvidence;
  metadata?: Record<string, unknown>;
}

export interface IngestionValidationIssue {
  path: string;
  code:
    | "invalid_type"
    | "invalid_literal"
    | "invalid_enum"
    | "invalid_slug"
    | "invalid_date"
    | "invalid_date_order"
    | "unsafe_path";
  message: string;
}

export type IngestionValidationResult =
  | {
      ok: true;
      value: IngestionEnvelope;
      issues: [];
    }
  | {
      ok: false;
      issues: IngestionValidationIssue[];
    };

export interface IngestionEvidenceSummaryItem {
  kind: "terraform_plan" | "iac_scan" | "log";
  label: string;
  path: string;
}

export interface IngestionEnvelopeSummary {
  organizationSlug: string;
  projectSlug: string;
  runName: string;
  status: IngestionStatus;
  evidence: IngestionEvidenceSummaryItem[];
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): value is T {
  return (
    typeof value === "string" &&
    (allowedValues as readonly string[]).includes(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function addIssue(
  issues: IngestionValidationIssue[],
  issue: IngestionValidationIssue,
): void {
  issues.push(issue);
}

function validateRequiredString(
  issues: IngestionValidationIssue[],
  record: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (!isNonEmptyString(record[key])) {
    addIssue(issues, {
      path,
      code: "invalid_type",
      message: `${path} must be a non-empty string`,
    });
  }
}

function validateOptionalString(
  issues: IngestionValidationIssue[],
  record: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (record[key] !== undefined && typeof record[key] !== "string") {
    addIssue(issues, {
      path,
      code: "invalid_type",
      message: `${path} must be a string when present`,
    });
  }
}

function validateSlug(
  issues: IngestionValidationIssue[],
  value: unknown,
  path: "organizationSlug" | "projectSlug",
): void {
  if (typeof value !== "string" || !slugPattern.test(value)) {
    addIssue(issues, {
      path,
      code: "invalid_slug",
      message: `${path} must be a lowercase dashed slug`,
    });
  }
}

function validateEvidencePath(
  issues: IngestionValidationIssue[],
  value: unknown,
  path: string,
): void {
  if (typeof value !== "string" || !isSafeFixturePath(value)) {
    addIssue(issues, {
      path,
      code: "unsafe_path",
      message: `${path} must be a safe relative fixture path`,
    });
  }
}

export function isSafeFixturePath(fixturePath: string): boolean {
  const trimmed = fixturePath.trim();

  if (trimmed.length === 0 || trimmed !== fixturePath) {
    return false;
  }

  if (trimmed.includes("\0")) {
    return false;
  }

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    /^[a-zA-Z]:[\\/]/.test(trimmed)
  ) {
    return false;
  }

  const parts = trimmed.split(/[\\/]+/);

  return parts.every(
    (part) => part.length > 0 && part !== "." && part !== "..",
  );
}

export function validateIngestionEnvelope(
  input: unknown,
): IngestionValidationResult {
  const issues: IngestionValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          path: "$",
          code: "invalid_type",
          message: "ingestion envelope must be an object",
        },
      ],
    };
  }

  if (input.schemaVersion !== INGESTION_SCHEMA_VERSION) {
    addIssue(issues, {
      path: "schemaVersion",
      code: "invalid_literal",
      message: `schemaVersion must be ${INGESTION_SCHEMA_VERSION}`,
    });
  }

  if (!isOneOf(input.source, INGESTION_SOURCES)) {
    addIssue(issues, {
      path: "source",
      code: "invalid_enum",
      message: "source must be one of github_actions, manual, fixture",
    });
  }

  validateSlug(issues, input.organizationSlug, "organizationSlug");
  validateSlug(issues, input.projectSlug, "projectSlug");

  if (!isRecord(input.run)) {
    addIssue(issues, {
      path: "run",
      code: "invalid_type",
      message: "run must be an object",
    });
  } else {
    validateRequiredString(
      issues,
      input.run,
      "externalRunId",
      "run.externalRunId",
    );
    validateRequiredString(issues, input.run, "name", "run.name");
    validateRequiredString(issues, input.run, "environment", "run.environment");
    validateOptionalString(issues, input.run, "branch", "run.branch");
    validateOptionalString(issues, input.run, "commitSha", "run.commitSha");
    validateOptionalString(
      issues,
      input.run,
      "externalRunUrl",
      "run.externalRunUrl",
    );

    if (!isOneOf(input.run.status, INGESTION_STATUSES)) {
      addIssue(issues, {
        path: "run.status",
        code: "invalid_enum",
        message:
          "run.status must be one of queued, running, succeeded, failed, canceled",
      });
    }

    if (!isValidDateString(input.run.startedAt)) {
      addIssue(issues, {
        path: "run.startedAt",
        code: "invalid_date",
        message: "run.startedAt must be a valid date string",
      });
    }

    if (
      input.run.completedAt !== undefined &&
      !isValidDateString(input.run.completedAt)
    ) {
      addIssue(issues, {
        path: "run.completedAt",
        code: "invalid_date",
        message: "run.completedAt must be a valid date string",
      });
    }

    if (
      isValidDateString(input.run.startedAt) &&
      isValidDateString(input.run.completedAt) &&
      Date.parse(input.run.completedAt) < Date.parse(input.run.startedAt)
    ) {
      addIssue(issues, {
        path: "run.completedAt",
        code: "invalid_date_order",
        message: "run.completedAt must not be earlier than run.startedAt",
      });
    }
  }

  if (!isRecord(input.evidence)) {
    addIssue(issues, {
      path: "evidence",
      code: "invalid_type",
      message: "evidence must be an object",
    });
  } else {
    validateEvidence(issues, input.evidence);
  }

  if (input.metadata !== undefined && !isRecord(input.metadata)) {
    addIssue(issues, {
      path: "metadata",
      code: "invalid_type",
      message: "metadata must be an object when present",
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    value: input as IngestionEnvelope,
    issues: [],
  };
}

function validateEvidence(
  issues: IngestionValidationIssue[],
  evidence: Record<string, unknown>,
): void {
  if (evidence.terraformPlan !== undefined) {
    if (!isRecord(evidence.terraformPlan)) {
      addIssue(issues, {
        path: "evidence.terraformPlan",
        code: "invalid_type",
        message: "evidence.terraformPlan must be an object when present",
      });
    } else {
      validateEvidencePath(
        issues,
        evidence.terraformPlan.path,
        "evidence.terraformPlan.path",
      );

      if (evidence.terraformPlan.format !== "terraform_show_json") {
        addIssue(issues, {
          path: "evidence.terraformPlan.format",
          code: "invalid_literal",
          message: "evidence.terraformPlan.format must be terraform_show_json",
        });
      }
    }
  }

  if (evidence.iacScan !== undefined) {
    if (!isRecord(evidence.iacScan)) {
      addIssue(issues, {
        path: "evidence.iacScan",
        code: "invalid_type",
        message: "evidence.iacScan must be an object when present",
      });
    } else {
      validateEvidencePath(
        issues,
        evidence.iacScan.path,
        "evidence.iacScan.path",
      );

      if (evidence.iacScan.scanner !== "checkov") {
        addIssue(issues, {
          path: "evidence.iacScan.scanner",
          code: "invalid_literal",
          message: "evidence.iacScan.scanner must be checkov",
        });
      }

      if (evidence.iacScan.format !== "checkov_json") {
        addIssue(issues, {
          path: "evidence.iacScan.format",
          code: "invalid_literal",
          message: "evidence.iacScan.format must be checkov_json",
        });
      }
    }
  }

  if (evidence.logs !== undefined) {
    if (!Array.isArray(evidence.logs)) {
      addIssue(issues, {
        path: "evidence.logs",
        code: "invalid_type",
        message: "evidence.logs must be an array when present",
      });
    } else {
      evidence.logs.forEach((log, index) => {
        const logPath = `evidence.logs[${index}]`;

        if (!isRecord(log)) {
          addIssue(issues, {
            path: logPath,
            code: "invalid_type",
            message: `${logPath} must be an object`,
          });
          return;
        }

        validateEvidencePath(issues, log.path, `${logPath}.path`);
        validateRequiredString(issues, log, "label", `${logPath}.label`);

        if (log.format !== "plain_text") {
          addIssue(issues, {
            path: `${logPath}.format`,
            code: "invalid_literal",
            message: `${logPath}.format must be plain_text`,
          });
        }
      });
    }
  }
}

export function summarizeIngestionEnvelope(
  envelope: IngestionEnvelope,
): IngestionEnvelopeSummary {
  const evidence: IngestionEvidenceSummaryItem[] = [];

  if (envelope.evidence.terraformPlan) {
    evidence.push({
      kind: "terraform_plan",
      label: "Terraform plan",
      path: envelope.evidence.terraformPlan.path,
    });
  }

  if (envelope.evidence.iacScan) {
    evidence.push({
      kind: "iac_scan",
      label: "IaC scan",
      path: envelope.evidence.iacScan.path,
    });
  }

  for (const log of envelope.evidence.logs ?? []) {
    evidence.push({
      kind: "log",
      label: "Log",
      path: log.path,
    });
  }

  return {
    organizationSlug: envelope.organizationSlug,
    projectSlug: envelope.projectSlug,
    runName: envelope.run.name,
    status: envelope.run.status,
    evidence,
  };
}
```

- [ ] **Step 2: Re-export ingestion helpers**

Append this line to the end of `packages/core/src/index.ts`:

```ts
export * from "./ingestion";
```

- [ ] **Step 3: Run the core tests**

Run:

```powershell
pnpm --filter @adia/core test
```

Expected: all ingestion tests pass.

- [ ] **Step 4: Run package typecheck**

Run:

```powershell
pnpm --filter @adia/core typecheck
```

Expected: exits successfully.

- [ ] **Step 5: Commit the core contract**

Run:

```powershell
git add packages/core/src/ingestion.ts packages/core/src/index.ts packages/core/test/ingestion.test.ts
git commit -m "Add ingestion contract validation"
```

Expected: commit succeeds.

## Task 4: Add Demo Fixtures And Replay Script

**Files:**

- Create: `scripts/fixtures/github-actions/deploy-staging.json`
- Create: `scripts/fixtures/terraform-plans/demo-plan.json`
- Create: `scripts/fixtures/checkov/demo-checkov.json`
- Create: `scripts/fixtures/logs/deploy-staging.log`
- Modify: `scripts/ingest-demo.ts`

- [ ] **Step 1: Create the GitHub Actions envelope fixture**

Create `scripts/fixtures/github-actions/deploy-staging.json` with:

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

- [ ] **Step 2: Create the Terraform evidence fixture**

Create `scripts/fixtures/terraform-plans/demo-plan.json` with:

```json
{
  "format_version": "1.2",
  "terraform_version": "1.8.5",
  "resource_changes": [
    {
      "address": "aws_security_group.web",
      "mode": "managed",
      "type": "aws_security_group",
      "name": "web",
      "provider_name": "registry.terraform.io/hashicorp/aws",
      "change": {
        "actions": ["create"],
        "after": {
          "name": "web"
        }
      }
    }
  ]
}
```

- [ ] **Step 3: Create the Checkov evidence fixture**

Create `scripts/fixtures/checkov/demo-checkov.json` with:

```json
{
  "check_type": "terraform",
  "results": {
    "failed_checks": [
      {
        "check_id": "CKV_AWS_24",
        "check_name": "Ensure no security groups allow ingress from all IPs to port 22",
        "resource": "aws_security_group.web",
        "file_path": "infra/demo/security_group.tf",
        "severity": "HIGH"
      }
    ],
    "passed_checks": [],
    "skipped_checks": []
  },
  "summary": {
    "passed": 0,
    "failed": 1,
    "skipped": 0
  }
}
```

- [ ] **Step 4: Create the log evidence fixture**

Create `scripts/fixtures/logs/deploy-staging.log` with:

```text
[deploy] checkout complete
[deploy] terraform plan generated
[deploy] checkov scan completed with fixture findings
[deploy] deployment finished successfully
```

- [ ] **Step 5: Replace `scripts/ingest-demo.ts`**

Replace `scripts/ingest-demo.ts` with:

```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSafeFixturePath,
  summarizeIngestionEnvelope,
  validateIngestionEnvelope,
} from "@adia/core";

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDirectory = path.dirname(currentFilePath);
const fixtureRoot = path.join(scriptsDirectory, "fixtures");
const defaultFixturePath = path.join(
  fixtureRoot,
  "github-actions",
  "deploy-staging.json",
);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Failed to read JSON fixture: ${detail}`);
  }
}

function resolveFixtureArgument(): string {
  if (!process.argv[2]) {
    return defaultFixturePath;
  }

  const resolvedPath = path.resolve(process.cwd(), process.argv[2]);

  if (!isPathInside(fixtureRoot, resolvedPath)) {
    fail("Fixture path must stay inside scripts/fixtures.");
  }

  return resolvedPath;
}

function verifyEvidenceFiles(evidencePaths: string[]): void {
  const missingPaths: string[] = [];

  for (const evidencePath of evidencePaths) {
    if (!isSafeFixturePath(evidencePath)) {
      fail(`Unsafe evidence path rejected: ${evidencePath}`);
    }

    const resolvedEvidencePath = path.resolve(fixtureRoot, evidencePath);

    if (!isPathInside(fixtureRoot, resolvedEvidencePath)) {
      fail(`Evidence path escapes fixture root: ${evidencePath}`);
    }

    if (!existsSync(resolvedEvidencePath)) {
      missingPaths.push(evidencePath);
    }
  }

  if (missingPaths.length > 0) {
    fail(
      `Missing evidence files:\n${missingPaths.map((item) => `- ${item}`).join("\n")}`,
    );
  }
}

function main(): void {
  const fixturePath = resolveFixtureArgument();
  const input = readJsonFile(fixturePath);
  const result = validateIngestionEnvelope(input);

  if (!result.ok) {
    console.error("ADIA ingestion fixture failed validation");
    for (const issue of result.issues) {
      console.error(`- ${issue.path}: ${issue.message}`);
    }
    process.exit(1);
  }

  const summary = summarizeIngestionEnvelope(result.value);
  verifyEvidenceFiles(summary.evidence.map((item) => item.path));

  console.log("ADIA ingestion fixture validated");
  console.log(`Organization: ${summary.organizationSlug}`);
  console.log(`Project: ${summary.projectSlug}`);
  console.log(`Run: ${summary.runName}`);
  console.log(`Status: ${summary.status}`);

  if (summary.evidence.length > 0) {
    console.log("Evidence:");
    for (const evidence of summary.evidence) {
      console.log(`- ${evidence.label}: ${evidence.path}`);
    }
  }
}

main();
```

- [ ] **Step 6: Run the demo script**

Run:

```powershell
pnpm exec tsx scripts/ingest-demo.ts
```

Expected output:

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

- [ ] **Step 7: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: exits successfully.

- [ ] **Step 8: Commit fixtures and script**

Run:

```powershell
git add scripts/fixtures/github-actions/deploy-staging.json scripts/fixtures/terraform-plans/demo-plan.json scripts/fixtures/checkov/demo-checkov.json scripts/fixtures/logs/deploy-staging.log scripts/ingest-demo.ts
git commit -m "Add fixture ingestion demo"
```

Expected: commit succeeds.

## Task 5: Document Fixture Ingestion Demo

**Files:**

- Create: `docs/INGESTION_FIXTURES.md`
- Modify: `README.md`

- [ ] **Step 1: Create fixture documentation**

Create `docs/INGESTION_FIXTURES.md` with:

````md
# Ingestion Fixtures

Phase 2 defines ADIA's fixture-only ingestion contract. It validates one deployment run envelope at a time and checks that referenced evidence files exist.

This phase does not write to Supabase, expose webhooks, parse Terraform plans, parse Checkov output, analyze anomalies, call LLM providers, or execute infrastructure commands.

## Fixture Layout

```text
scripts/fixtures/github-actions/   Ingestion envelope fixtures
scripts/fixtures/terraform-plans/  Raw Terraform plan evidence
scripts/fixtures/checkov/          Raw Checkov evidence
scripts/fixtures/logs/             Plain-text log evidence
```

Each GitHub Actions fixture represents one deployment run. Evidence files are referenced by relative path from `scripts/fixtures`.

## Run The Demo

```powershell
pnpm exec tsx scripts/ingest-demo.ts
```

You can also pass a fixture path inside `scripts/fixtures`:

```powershell
pnpm exec tsx scripts/ingest-demo.ts scripts/fixtures/github-actions/deploy-staging.json
```

The script validates the envelope and verifies evidence files exist. It prints a summary only.

## Safety Rules

- Evidence paths must be relative.
- Evidence paths cannot use parent-directory traversal.
- Evidence paths cannot be absolute local paths.
- Service-role keys and LLM keys are not read.
- Fixture contents are not parsed in Phase 2.
- The demo script does not persist data.
````

- [ ] **Step 2: Update README local development docs**

Add this section in `README.md` after the quality checks command block:

````md
Run the Phase 2 fixture ingestion demo:

```bash
pnpm exec tsx scripts/ingest-demo.ts
```

The demo validates one deployment-run fixture and checks that referenced evidence files exist. It does not write to Supabase. See `docs/INGESTION_FIXTURES.md` for details.
````

- [ ] **Step 3: Run format check**

Run:

```powershell
pnpm format
```

Expected: exits successfully.

- [ ] **Step 4: Commit documentation**

Run:

```powershell
git add docs/INGESTION_FIXTURES.md README.md
git commit -m "Document fixture ingestion demo"
```

Expected: commit succeeds.

## Task 6: Full Verification

**Files:**

- Read all changed files.

- [ ] **Step 1: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: exits successfully.

- [ ] **Step 2: Run tests**

Run:

```powershell
pnpm test
```

Expected: core ingestion tests and analyzer tests pass.

- [ ] **Step 3: Run lint**

Run:

```powershell
pnpm lint
```

Expected: exits successfully.

- [ ] **Step 4: Run format check**

Run:

```powershell
pnpm format
```

Expected: exits successfully.

- [ ] **Step 5: Run build**

Run:

```powershell
pnpm build
```

Expected: exits successfully.

- [ ] **Step 6: Run fixture smoke test**

Run:

```powershell
pnpm exec tsx scripts/ingest-demo.ts
```

Expected output:

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

- [ ] **Step 7: Scan filenames for date-like names**

Run:

```powershell
rg --files | Select-String -Pattern '(^|[\\/])(?:19|20)[0-9]{6}[_-]|[0-9]{4}-[0-9]{2}-[0-9]{2}'
```

Expected: no output.

- [ ] **Step 8: Scan for forbidden implementation scope**

Run:

```powershell
rg -n "createClient|SUPABASE_SERVICE_ROLE_KEY|LLM_API_KEY|terraform apply|child_process|exec\\(|spawn\\(" packages scripts apps docs
```

Expected: no implementation matches that indicate Supabase writes, LLM access, Terraform execution, or process execution. Documentation may contain forbidden terms only as explicit safety exclusions.

- [ ] **Step 9: Commit verification cleanup if formatting changed files**

Run only if `git status --short` shows formatting changes:

```powershell
git add .
git commit -m "Apply Phase 2 formatting"
```

Expected: commit succeeds only when tracked file changes exist.

## Task 7: Final Review And Push

**Files:**

- Read: `git status --short`
- Read: `git log --oneline -8`

- [ ] **Step 1: Review final diff**

Run:

```powershell
git diff --stat origin/main..HEAD
```

Expected: shows only the Phase 2 design and implementation files.

- [ ] **Step 2: Confirm clean worktree**

Run:

```powershell
git status --short --branch
```

Expected: clean worktree on `main`, ahead of `origin/main` by the Phase 2 commits.

- [ ] **Step 3: Push to GitHub**

Run:

```powershell
git push origin main
```

Expected: push succeeds.

- [ ] **Step 4: Prepare completion summary**

Include these items in the final response:

```text
Implemented Phase 2 fixture-only ingestion contracts.
Added core validation helpers and tests.
Added demo fixtures and local ingest-demo script.
Added fixture ingestion documentation.
Confirmed no Supabase writes, parser logic, LLM calls, or Terraform execution were added.
Reported all verification commands and push status.
```

## Self-Review Checklist

- [ ] `packages/core` owns reusable ingestion contracts and validation helpers.
- [ ] The demo script stays thin and local.
- [ ] Every fixture represents one deployment run.
- [ ] Evidence paths are references only and are not parsed.
- [ ] Unsafe evidence paths are rejected.
- [ ] Unit tests cover valid and invalid envelopes.
- [ ] The demo script checks referenced evidence files exist.
- [ ] No Supabase client or service-role usage is added.
- [ ] No webhook route or API route is added.
- [ ] No Terraform, Checkov, log, anomaly, or LLM processing is implemented.
- [ ] No filename contains a date.
- [ ] All available checks pass.
