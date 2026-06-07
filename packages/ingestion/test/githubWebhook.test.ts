import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  loadGitHubWorkflowRunWebhookConfig,
  parseGitHubWebhookDryRun,
  processGitHubWorkflowRunWebhook,
  verifyGitHubWebhookSignature,
  type GitHubWorkflowRunWebhookEnv,
} from "../src/githubWebhook";

const secret = "local-github-webhook-secret";

const workflowRunPayload = (): string =>
  JSON.stringify({
    action: "completed",
    workflow: {
      id: 42,
      name: "Deploy staging",
      path: ".github/workflows/deploy-staging.yml",
    },
    workflow_run: {
      id: 123456789,
      name: "Deploy staging",
      event: "push",
      status: "completed",
      conclusion: "success",
      html_url: "https://github.com/GreatlyDev/ADIA/actions/runs/123456789",
      run_started_at: "2026-01-15T12:00:00Z",
      updated_at: "2026-01-15T12:07:30Z",
      head_branch: "main",
      head_sha: "0123456789abcdef0123456789abcdef01234567",
      actor: {
        login: "GreatlyDev",
      },
    },
    repository: {
      id: 987654321,
      name: "ADIA",
      full_name: "GreatlyDev/ADIA",
      html_url: "https://github.com/GreatlyDev/ADIA",
      owner: {
        login: "GreatlyDev",
      },
    },
  });

const signPayload = (payload: string, value = secret): string =>
  `sha256=${createHmac("sha256", value).update(payload).digest("hex")}`;

const webhookEnv = (): GitHubWorkflowRunWebhookEnv => ({
  GITHUB_WEBHOOK_SECRET: secret,
  ADIA_GITHUB_WEBHOOK_ORGANIZATION_SLUG: "adia-demo-org",
  ADIA_GITHUB_WEBHOOK_PROJECT_SLUG: "adia-demo-service",
  ADIA_GITHUB_WEBHOOK_ENVIRONMENT: "staging",
  ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON: JSON.stringify([
    {
      kind: "terraform_plan",
      format: "terraform_show_json",
      path: "terraform-plans/demo-plan.json",
      label: "Demo Terraform plan JSON",
    },
    {
      kind: "iac_scan",
      format: "checkov_json",
      path: "checkov/demo-checkov.json",
      label: "Demo Checkov scan JSON",
    },
    {
      kind: "log",
      format: "plain_text",
      path: "logs/deploy-staging.log",
      label: "Demo deployment log",
    },
  ]),
});

describe("verifyGitHubWebhookSignature", () => {
  it("accepts a valid sha256 GitHub webhook signature", () => {
    const payload = workflowRunPayload();

    expect(
      verifyGitHubWebhookSignature({
        payload,
        signature256: signPayload(payload),
        secret,
      }),
    ).toBe(true);
  });

  it("rejects a missing or invalid sha256 GitHub webhook signature", () => {
    const payload = workflowRunPayload();

    expect(
      verifyGitHubWebhookSignature({
        payload,
        signature256: undefined,
        secret,
      }),
    ).toBe(false);

    expect(
      verifyGitHubWebhookSignature({
        payload,
        signature256: "sha256=bad",
        secret,
      }),
    ).toBe(false);
  });
});

describe("loadGitHubWorkflowRunWebhookConfig", () => {
  it("loads server-side adapter config from environment values", () => {
    const config = loadGitHubWorkflowRunWebhookConfig(webhookEnv());

    expect(config).toMatchObject({
      secret,
      adapterOptions: {
        organizationSlug: "adia-demo-org",
        projectSlug: "adia-demo-service",
        environment: "staging",
      },
    });
    expect(config.adapterOptions.evidence).toHaveLength(3);
  });

  it("rejects missing webhook secrets", () => {
    const env = webhookEnv();
    env.GITHUB_WEBHOOK_SECRET = "";

    expect(() => loadGitHubWorkflowRunWebhookConfig(env)).toThrow(
      "GITHUB_WEBHOOK_SECRET is required for GitHub webhook ingestion.",
    );
  });

  it("rejects evidence config that is not a JSON array", () => {
    const env = webhookEnv();
    env.ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON = "{}";

    expect(() => loadGitHubWorkflowRunWebhookConfig(env)).toThrow(
      "ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON must be a JSON array.",
    );
  });
});

describe("parseGitHubWebhookDryRun", () => {
  it.each([
    ["1", true],
    ["true", true],
    ["TRUE", true],
    ["yes", true],
    ["0", false],
    ["false", false],
    [null, false],
  ] as const)("parses dryRun=%s as %s", (value, expected) => {
    expect(parseGitHubWebhookDryRun(value)).toBe(expected);
  });
});

describe("processGitHubWorkflowRunWebhook", () => {
  it("verifies, maps, and returns an ADIA envelope for a dry-run workflow_run webhook", () => {
    const payload = workflowRunPayload();
    const result = processGitHubWorkflowRunWebhook({
      payload,
      eventName: "workflow_run",
      signature256: signPayload(payload),
      deliveryId: "delivery-123",
      config: loadGitHubWorkflowRunWebhookConfig(webhookEnv()),
      dryRun: true,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      dryRun: true,
      persisted: false,
      event: "workflow_run",
      deliveryId: "delivery-123",
      summary: {
        organizationSlug: "adia-demo-org",
        projectSlug: "adia-demo-service",
        runName: "Deploy staging",
        status: "succeeded",
      },
      envelope: {
        schemaVersion: "adia.ingestion.v1",
        source: "github_actions",
        run: {
          externalId: "123456789",
          status: "succeeded",
        },
      },
    });
  });

  it("rejects invalid signatures before parsing the JSON body", () => {
    const result = processGitHubWorkflowRunWebhook({
      payload: "{not-json",
      eventName: "workflow_run",
      signature256: "sha256=invalid",
      deliveryId: "delivery-123",
      config: loadGitHubWorkflowRunWebhookConfig(webhookEnv()),
      dryRun: true,
    });

    expect(result).toEqual({
      status: 401,
      body: {
        ok: false,
        deliveryId: "delivery-123",
        error: {
          code: "invalid_signature",
          message: "GitHub webhook signature verification failed.",
        },
      },
    });
  });

  it("ignores signed GitHub events that are not workflow_run events", () => {
    const payload = workflowRunPayload();
    const result = processGitHubWorkflowRunWebhook({
      payload,
      eventName: "push",
      signature256: signPayload(payload),
      deliveryId: "delivery-123",
      config: loadGitHubWorkflowRunWebhookConfig(webhookEnv()),
      dryRun: true,
    });

    expect(result).toEqual({
      status: 202,
      body: {
        ok: true,
        ignored: true,
        event: "push",
        deliveryId: "delivery-123",
        reason: "Only workflow_run events are handled in Phase 2D.",
      },
    });
  });

  it("rejects invalid JSON after signature verification succeeds", () => {
    const payload = "{not-json";
    const result = processGitHubWorkflowRunWebhook({
      payload,
      eventName: "workflow_run",
      signature256: signPayload(payload),
      deliveryId: "delivery-123",
      config: loadGitHubWorkflowRunWebhookConfig(webhookEnv()),
      dryRun: true,
    });

    expect(result).toMatchObject({
      status: 400,
      body: {
        ok: false,
        deliveryId: "delivery-123",
        error: {
          code: "invalid_json",
          message: "GitHub webhook payload must be valid JSON.",
        },
      },
    });
  });

  it("returns adapter validation errors for invalid workflow_run payloads", () => {
    const payload = JSON.stringify({
      action: "completed",
      workflow_run: {
        name: "Deploy staging",
        status: "completed",
        conclusion: "success",
        run_started_at: "2026-01-15T12:00:00Z",
        head_branch: "main",
        head_sha: "0123456789abcdef0123456789abcdef01234567",
      },
    });

    const result = processGitHubWorkflowRunWebhook({
      payload,
      eventName: "workflow_run",
      signature256: signPayload(payload),
      deliveryId: "delivery-123",
      config: loadGitHubWorkflowRunWebhookConfig(webhookEnv()),
      dryRun: true,
    });

    expect(result).toEqual({
      status: 422,
      body: {
        ok: false,
        deliveryId: "delivery-123",
        error: {
          code: "invalid_github_event",
          message: "GitHub workflow_run event is missing workflow_run.id.",
        },
      },
    });
  });
});
