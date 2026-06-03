import { describe, expect, it } from "vitest";

import type { IngestionEnvelope } from "@adia/core";

import {
  SupabaseFixtureIngestionError,
  buildDeploymentRunWrite,
  buildRawEvidenceFileRows,
  ingestFixtureEnvelope,
  type EvidenceFileMetadata,
} from "../src/supabaseFixtureIngestion";

const validEnvelope = (): IngestionEnvelope => ({
  schemaVersion: "adia.ingestion.v1",
  source: "github_actions",
  organizationSlug: "adia-demo-org",
  projectSlug: "adia-demo-service",
  run: {
    externalId: "123456789",
    name: "Deploy staging from GitHub Actions",
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
      metadata: {
        source: "workflow-log",
      },
    },
  ],
  metadata: {
    workflow: "deploy-staging",
    runner: "ubuntu-latest",
  },
});

const evidenceFileMetadata: Record<string, EvidenceFileMetadata> = {
  "terraform-plans/demo-plan.json": {
    sizeBytes: 1024,
    contentSha256: "a".repeat(64),
  },
  "checkov/demo-checkov.json": {
    sizeBytes: 512,
    contentSha256: "b".repeat(64),
  },
  "logs/deploy-staging.log": {
    sizeBytes: 256,
    contentSha256: "c".repeat(64),
  },
};

describe("buildDeploymentRunWrite", () => {
  it("maps a fixture envelope to a deployment_runs write row", () => {
    const row = buildDeploymentRunWrite(validEnvelope(), {
      organizationId: "org-1",
      projectId: "project-1",
    });

    expect(row).toEqual({
      organization_id: "org-1",
      project_id: "project-1",
      name: "Deploy staging from GitHub Actions",
      status: "succeeded",
      environment: "staging",
      source: "github_actions",
      commit_sha: "0123456789abcdef0123456789abcdef01234567",
      branch: "main",
      external_run_id: "123456789",
      external_run_url:
        "https://github.com/GreatlyDev/ADIA/actions/runs/123456789",
      started_at: "2026-01-15T12:00:00.000Z",
      completed_at: "2026-01-15T12:07:30.000Z",
      duration_seconds: 450,
      metadata: {
        envelope: {
          runner: "ubuntu-latest",
          workflow: "deploy-staging",
        },
        ingestion: {
          actor: "GreatlyDev",
          evidenceCount: 3,
          schemaVersion: "adia.ingestion.v1",
          source: "github_actions",
        },
        run: {},
      },
    });
  });
});

describe("buildRawEvidenceFileRows", () => {
  it("maps evidence references to raw_evidence_files write rows without raw content", () => {
    const rows = buildRawEvidenceFileRows(validEnvelope(), {
      deploymentRunId: "run-1",
      evidenceFileMetadata,
      organizationId: "org-1",
    });

    expect(rows).toEqual([
      {
        organization_id: "org-1",
        deployment_run_id: "run-1",
        kind: "terraform_plan",
        format: "terraform_show_json",
        path: "terraform-plans/demo-plan.json",
        label: "Demo Terraform plan JSON",
        size_bytes: 1024,
        content_sha256: "a".repeat(64),
        metadata: {
          evidence: {},
          ingestion: {
            schemaVersion: "adia.ingestion.v1",
            source: "github_actions",
          },
        },
      },
      {
        organization_id: "org-1",
        deployment_run_id: "run-1",
        kind: "iac_scan",
        format: "checkov_json",
        path: "checkov/demo-checkov.json",
        label: "Demo Checkov scan JSON",
        size_bytes: 512,
        content_sha256: "b".repeat(64),
        metadata: {
          evidence: {},
          ingestion: {
            schemaVersion: "adia.ingestion.v1",
            source: "github_actions",
          },
        },
      },
      {
        organization_id: "org-1",
        deployment_run_id: "run-1",
        kind: "log",
        format: "plain_text",
        path: "logs/deploy-staging.log",
        label: "Demo deployment log",
        size_bytes: 256,
        content_sha256: "c".repeat(64),
        metadata: {
          evidence: {
            source: "workflow-log",
          },
          ingestion: {
            schemaVersion: "adia.ingestion.v1",
            source: "github_actions",
          },
        },
      },
    ]);
  });
});

describe("ingestFixtureEnvelope", () => {
  it("rejects invalid envelopes before any Supabase query runs", async () => {
    const client = createFakeSupabaseClient();

    await expect(
      ingestFixtureEnvelope(client, {
        schemaVersion: "bad-version",
      }),
    ).rejects.toMatchObject({
      code: "invalid_envelope",
    });

    expect(client.calls).toEqual([]);
  });

  it("writes one deployment run and raw evidence metadata rows", async () => {
    const client = createFakeSupabaseClient();

    const result = await ingestFixtureEnvelope(client, validEnvelope(), {
      evidenceFileMetadata,
    });

    expect(result).toEqual({
      deploymentRun: {
        id: "run-1",
        organization_id: "org-1",
        project_id: "project-1",
        name: "Deploy staging from GitHub Actions",
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
    });

    expect(client.tables.deployment_runs).toHaveLength(1);
    expect(client.tables.raw_evidence_files).toHaveLength(3);
    expect(client.calls.map((call) => call.table)).toEqual([
      "organizations",
      "projects",
      "deployment_runs",
      "raw_evidence_files",
    ]);
  });

  it("requires the project slug to belong to the resolved organization", async () => {
    const client = createFakeSupabaseClient();
    client.tables.projects.unshift({
      id: "other-project",
      organization_id: "other-org",
      slug: "adia-demo-service",
    });

    await ingestFixtureEnvelope(client, validEnvelope(), {
      evidenceFileMetadata,
    });

    expect(client.tables.deployment_runs[0]?.project_id).toBe("project-1");
  });

  it("throws a typed error when the organization slug is unknown", async () => {
    const client = createFakeSupabaseClient();
    client.tables.organizations = [];

    await expect(
      ingestFixtureEnvelope(client, validEnvelope(), {
        evidenceFileMetadata,
      }),
    ).rejects.toBeInstanceOf(SupabaseFixtureIngestionError);

    await expect(
      ingestFixtureEnvelope(client, validEnvelope(), {
        evidenceFileMetadata,
      }),
    ).rejects.toMatchObject({
      code: "organization_not_found",
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
