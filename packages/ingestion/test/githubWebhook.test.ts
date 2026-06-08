import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  gitHubWebhookPersistenceErrorToResult,
  loadGitHubWorkflowRunWebhookConfig,
  parseGitHubWebhookDryRun,
  persistGitHubWorkflowRunWebhookEnvelope,
  processGitHubWorkflowRunWebhook,
  verifyGitHubWebhookSignature,
  type GitHubWorkflowRunWebhookEnv,
} from "../src/githubWebhook";
import { SupabaseFixtureIngestionError } from "../src/supabaseFixtureIngestion";

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

  it("exposes the mapped envelope for non-dry-run persistence without returning it in the response body", () => {
    const payload = workflowRunPayload();
    const result = processGitHubWorkflowRunWebhook({
      payload,
      eventName: "workflow_run",
      signature256: signPayload(payload),
      deliveryId: "delivery-123",
      config: loadGitHubWorkflowRunWebhookConfig(webhookEnv()),
      dryRun: false,
    });

    expect(result).toMatchObject({
      status: 202,
      envelope: {
        schemaVersion: "adia.ingestion.v1",
        source: "github_actions",
        run: {
          externalId: "123456789",
          status: "succeeded",
        },
      },
      body: {
        ok: true,
        dryRun: false,
        persisted: false,
        event: "workflow_run",
        deliveryId: "delivery-123",
      },
    });
    expect(result.body).not.toHaveProperty("envelope");
  });
});

describe("persistGitHubWorkflowRunWebhookEnvelope", () => {
  it("persists a mapped webhook envelope to deployment run and raw evidence metadata rows", async () => {
    const payload = workflowRunPayload();
    const mapping = processGitHubWorkflowRunWebhook({
      payload,
      eventName: "workflow_run",
      signature256: signPayload(payload),
      deliveryId: "delivery-123",
      config: loadGitHubWorkflowRunWebhookConfig(webhookEnv()),
      dryRun: false,
    });

    if (!("envelope" in mapping) || !mapping.envelope) {
      throw new Error("Expected mapped webhook envelope.");
    }

    const client = createFakeSupabaseClient();
    const result = await persistGitHubWorkflowRunWebhookEnvelope({
      client,
      deliveryId: "delivery-123",
      envelope: mapping.envelope,
    });

    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        dryRun: false,
        persisted: true,
        event: "workflow_run",
        deliveryId: "delivery-123",
        summary: {
          organizationSlug: "adia-demo-org",
          projectSlug: "adia-demo-service",
          runName: "Deploy staging",
          status: "succeeded",
          evidence: [
            "Terraform plan: terraform-plans/demo-plan.json",
            "IaC scan: checkov/demo-checkov.json",
            "Log: logs/deploy-staging.log",
          ],
        },
        deploymentRun: {
          id: "run-1",
          organizationId: "org-1",
          projectId: "project-1",
          name: "Deploy staging",
        },
        rawEvidenceFiles: [
          {
            id: "evidence-1",
            path: "terraform-plans/demo-plan.json",
            kind: "terraform_plan",
            format: "terraform_show_json",
          },
          {
            id: "evidence-2",
            path: "checkov/demo-checkov.json",
            kind: "iac_scan",
            format: "checkov_json",
          },
          {
            id: "evidence-3",
            path: "logs/deploy-staging.log",
            kind: "log",
            format: "plain_text",
          },
        ],
        message: "Webhook verified, mapped, and persisted to Supabase.",
      },
    });

    expect(client.tables.deployment_runs).toHaveLength(1);
    expect(client.tables.raw_evidence_files).toHaveLength(3);
    expect(client.tables.raw_evidence_files).toEqual([
      expect.objectContaining({
        path: "terraform-plans/demo-plan.json",
        size_bytes: null,
        content_sha256: null,
      }),
      expect.objectContaining({
        path: "checkov/demo-checkov.json",
        size_bytes: null,
        content_sha256: null,
      }),
      expect.objectContaining({
        path: "logs/deploy-staging.log",
        size_bytes: null,
        content_sha256: null,
      }),
    ]);
  });
});

describe("gitHubWebhookPersistenceErrorToResult", () => {
  it("converts Supabase ingestion failures to typed webhook error responses", () => {
    const result = gitHubWebhookPersistenceErrorToResult(
      new SupabaseFixtureIngestionError(
        "organization_not_found",
        "Organization slug not found: adia-demo-org",
        {
          message: "No rows found",
        },
      ),
      "delivery-123",
    );

    expect(result).toEqual({
      status: 500,
      body: {
        ok: false,
        deliveryId: "delivery-123",
        error: {
          code: "organization_not_found",
          message: "Organization slug not found: adia-demo-org",
          details: {
            message: "No rows found",
          },
        },
      },
    });
  });
});

type FakeTableName =
  | "organizations"
  | "projects"
  | "deployment_runs"
  | "raw_evidence_files";

interface FakeCall {
  table: string;
  operation: "select" | "upsert";
  filters: Record<string, unknown>;
}

interface FakeRow {
  id: string;
  [key: string]: unknown;
}

const createFakeSupabaseClient = () => {
  const client = {
    calls: [] as FakeCall[],
    nextRunId: 1,
    nextEvidenceId: 1,
    tables: {
      organizations: [
        {
          id: "org-1",
          slug: "adia-demo-org",
        },
      ] as FakeRow[],
      projects: [
        {
          id: "project-1",
          organization_id: "org-1",
          slug: "adia-demo-service",
        },
      ] as FakeRow[],
      deployment_runs: [] as FakeRow[],
      raw_evidence_files: [] as FakeRow[],
    },
    from(table: FakeTableName) {
      return new FakeQueryBuilder(client, table);
    },
  };

  return client;
};

class FakeQueryBuilder {
  private filters: Record<string, unknown> = {};
  private operation: "select" | "upsert" = "select";
  private payload: unknown;
  private selectedColumns: string[] | null = null;

  constructor(
    private readonly client: ReturnType<typeof createFakeSupabaseClient>,
    private readonly table: FakeTableName,
  ) {}

  select(columns?: string): this {
    this.selectedColumns =
      columns
        ?.split(",")
        .map((column) => column.trim())
        .filter(Boolean) ?? null;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters[column] = value;
    return this;
  }

  upsert(payload: unknown): this {
    this.operation = "upsert";
    this.payload = payload;
    return this;
  }

  single(): Promise<{
    data: FakeRow | null;
    error: { message: string } | null;
  }> {
    this.recordCall();

    if (this.operation === "upsert") {
      const rows = this.upsertRows(this.payload);
      return Promise.resolve({
        data: this.projectRow(rows[0] ?? null),
        error: null,
      });
    }

    const row =
      this.client.tables[this.table].find((candidate) =>
        Object.entries(this.filters).every(
          ([key, value]) => candidate[key] === value,
        ),
      ) ?? null;

    if (!row) {
      return Promise.resolve({
        data: null,
        error: {
          message: "No rows found",
        },
      });
    }

    return Promise.resolve({
      data: this.projectRow(row),
      error: null,
    });
  }

  then<TResult1 = { data: FakeRow[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: FakeRow[];
          error: null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.recordCall();

    if (this.operation !== "upsert") {
      return Promise.resolve({ data: [], error: null }).then(
        onfulfilled,
        onrejected,
      );
    }

    return Promise.resolve({
      data: this.upsertRows(this.payload).map((row) =>
        this.projectRequiredRow(row),
      ),
      error: null,
    }).then(onfulfilled, onrejected);
  }

  private recordCall(): void {
    this.client.calls.push({
      table: this.table,
      operation: this.operation,
      filters: this.filters,
    });
  }

  private upsertRows(payload: unknown): FakeRow[] {
    const rows = Array.isArray(payload) ? payload : [payload];

    return rows.map((row) => {
      const writableRow = row as Record<string, unknown>;
      const id =
        this.table === "deployment_runs"
          ? `run-${this.client.nextRunId++}`
          : `evidence-${this.client.nextEvidenceId++}`;
      const storedRow = {
        id,
        ...writableRow,
      };

      this.client.tables[this.table].push(storedRow);

      return storedRow;
    });
  }

  private projectRow(row: FakeRow | null): FakeRow | null {
    if (!row || !this.selectedColumns) {
      return row;
    }

    return Object.fromEntries(
      this.selectedColumns.map((column) => [column, row[column]]),
    ) as FakeRow;
  }

  private projectRequiredRow(row: FakeRow): FakeRow {
    return this.projectRow(row) ?? row;
  }
}
