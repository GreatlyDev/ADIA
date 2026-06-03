import { describe, expect, it } from "vitest";

import {
  isSafeFixturePath,
  summarizeIngestionEnvelope,
  validateIngestionEnvelope,
  type IngestionEnvelope,
} from "../src/ingestion";

const validEnvelope = (): IngestionEnvelope => ({
  schemaVersion: "adia.ingestion.v1",
  source: "github_actions",
  organizationSlug: "greatly-dev",
  projectSlug: "adia-demo",
  run: {
    externalId: "123456789",
    name: "Deploy staging",
    status: "succeeded",
    environment: "staging",
    startedAt: "2026-01-15T12:00:00.000Z",
    completedAt: "2026-01-15T12:07:30.000Z",
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    branch: "main",
    actor: "GreatlyDev",
    url: "https://github.com/GreatlyDev/ADIA/actions/runs/123456789",
  },
  evidence: [
    {
      kind: "terraform_plan",
      format: "terraform_show_json",
      path: "terraform-plans/demo-plan.json",
      label: "Terraform plan JSON",
    },
    {
      kind: "iac_scan",
      format: "checkov_json",
      path: "checkov/demo-checkov.json",
      label: "Checkov JSON",
    },
    {
      kind: "log",
      format: "plain_text",
      path: "logs/deploy-staging.log",
    },
  ],
  metadata: {
    workflow: "deploy-staging",
  },
});

describe("validateIngestionEnvelope", () => {
  it("accepts a valid ingestion envelope", () => {
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
      message: "Expected schema version adia.ingestion.v1.",
    });
  });

  it("rejects invalid organization and project slugs", () => {
    const envelope = {
      ...validEnvelope(),
      organizationSlug: "Greatly Dev",
      projectSlug: "adia_demo",
    };

    const result = validateIngestionEnvelope(envelope);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          path: "organizationSlug",
          message:
            "Expected a lowercase slug with letters, numbers, and hyphens.",
        },
        {
          path: "projectSlug",
          message:
            "Expected a lowercase slug with letters, numbers, and hyphens.",
        },
      ]),
    );
  });

  it("rejects an unknown run status", () => {
    const envelope = {
      ...validEnvelope(),
      run: {
        ...validEnvelope().run,
        status: "waiting",
      },
    };

    const result = validateIngestionEnvelope(envelope);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      path: "run.status",
      message: "Expected one of queued, running, succeeded, failed, canceled.",
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
      message: "Expected an ISO timestamp.",
    });
  });

  it("rejects a completedAt value earlier than startedAt", () => {
    const envelope = {
      ...validEnvelope(),
      run: {
        ...validEnvelope().run,
        completedAt: "2026-01-15T11:59:59.000Z",
      },
    };

    const result = validateIngestionEnvelope(envelope);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      path: "run.completedAt",
      message: "Expected completedAt to be after startedAt.",
    });
  });

  it("rejects unsafe evidence paths", () => {
    const envelope = {
      ...validEnvelope(),
      evidence: [
        {
          kind: "log",
          format: "plain_text",
          path: "../secrets.env",
        },
      ],
    };

    const result = validateIngestionEnvelope(envelope);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      path: "evidence[0].path",
      message: "Expected a safe relative fixture path.",
    });
  });
});

describe("isSafeFixturePath", () => {
  it("accepts simple relative fixture paths", () => {
    expect(isSafeFixturePath("logs/deploy-staging.log")).toBe(true);
    expect(isSafeFixturePath("terraform-plans/demo-plan.json")).toBe(true);
  });

  it("rejects empty paths, traversal, absolute paths, and duplicate separators", () => {
    expect(isSafeFixturePath("")).toBe(false);
    expect(isSafeFixturePath(" logs/deploy-staging.log")).toBe(false);
    expect(isSafeFixturePath("../secrets.env")).toBe(false);
    expect(isSafeFixturePath("logs/../secrets.env")).toBe(false);
    expect(isSafeFixturePath("/tmp/demo.json")).toBe(false);
    expect(isSafeFixturePath("\\tmp\\demo.json")).toBe(false);
    expect(isSafeFixturePath("C:\\temp\\demo.json")).toBe(false);
    expect(isSafeFixturePath("logs//deploy-staging.log")).toBe(false);
  });
});

describe("summarizeIngestionEnvelope", () => {
  it("returns a compact run and evidence summary", () => {
    const summary = summarizeIngestionEnvelope(validEnvelope());

    expect(summary).toEqual({
      organizationSlug: "greatly-dev",
      projectSlug: "adia-demo",
      runName: "Deploy staging",
      status: "succeeded",
      evidence: [
        "Terraform plan: terraform-plans/demo-plan.json",
        "IaC scan: checkov/demo-checkov.json",
        "Log: logs/deploy-staging.log",
      ],
    });
  });
});
