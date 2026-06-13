import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FixtureReplayError, replayParsedFixture } from "../src/fixtureReplay";

const createdFixtureRoots: string[] = [];

const validEnvelope = () => ({
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
    },
  ],
  metadata: {
    workflow: "deploy-staging",
  },
});

const terraformPlan = () => ({
  format_version: "1.2",
  resource_changes: [
    {
      address: "aws_iam_role.deploy",
      type: "aws_iam_role",
      name: "deploy",
      provider_name: "registry.terraform.io/hashicorp/aws",
      change: {
        actions: ["create"],
        before: null,
        after: {
          name: "deploy-role",
        },
      },
    },
  ],
});

const checkovScan = () => ({
  results: {
    failed_checks: [
      {
        check_id: "CKV_AWS_24",
        check_name:
          "Ensure no security groups allow ingress from 0.0.0.0/0 to port 22",
        severity: "HIGH",
        file_path: "/main.tf",
        resource: "aws_security_group.web",
        guideline: "https://docs.bridgecrew.io/docs/networking_1-port-security",
      },
    ],
    passed_checks: [],
    skipped_checks: [],
    unknown_checks: [],
  },
});

describe("replayParsedFixture", () => {
  afterEach(() => {
    while (createdFixtureRoots.length > 0) {
      rmSync(createdFixtureRoots.pop() as string, {
        force: true,
        recursive: true,
      });
    }
  });

  it("validates, parses, ingests raw metadata, and persists parser output from local fixture JSON", async () => {
    const fixtureRoot = createFixtureRoot();
    const client = createFakeSupabaseClient();

    const result = await replayParsedFixture(client, {
      fixturePath: "github-actions/deploy-staging.json",
      fixtureRoot,
    });

    expect(result).toEqual({
      checkovFindingCount: 1,
      deploymentRunId: "run-1",
      evidenceLinkCount: 3,
      organizationId: "org-1",
      rawEvidenceFileCount: 3,
      terraformPlanId: "terraform-plan-1",
      terraformResourceChangeCount: 1,
    });
    expect(client.tables.deployment_runs).toHaveLength(1);
    expect(client.tables.raw_evidence_files).toHaveLength(3);
    expect(client.tables.terraform_plans).toHaveLength(1);
    expect(client.tables.terraform_resource_changes).toHaveLength(1);
    expect(client.tables.iac_scan_findings).toHaveLength(1);
    expect(client.tables.evidence_links).toHaveLength(3);
  });

  it("rejects unsafe fixture paths before reading files", async () => {
    const fixtureRoot = createFixtureRoot();
    const client = createFakeSupabaseClient();

    await expect(
      replayParsedFixture(client, {
        fixturePath: "../outside.json",
        fixtureRoot,
      }),
    ).rejects.toBeInstanceOf(FixtureReplayError);

    expect(client.tables.deployment_runs).toHaveLength(0);
  });
});

const createFixtureRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "adia-fixture-replay-"));

  createdFixtureRoots.push(root);

  writeFixture(root, "github-actions/deploy-staging.json", validEnvelope());
  writeFixture(root, "terraform-plans/demo-plan.json", terraformPlan());
  writeFixture(root, "checkov/demo-checkov.json", checkovScan());
  writeFixture(root, "logs/deploy-staging.log", "deploy log");

  return root;
};

const writeFixture = (root: string, path: string, value: unknown): void => {
  const fullPath = join(root, ...path.split("/"));
  const directory = dirname(fullPath);

  if (directory !== fullPath) {
    mkdirSync(directory, { recursive: true });
  }

  writeFileSync(
    fullPath,
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
    "utf8",
  );
};

type FakeTableName =
  | "organizations"
  | "projects"
  | "deployment_runs"
  | "raw_evidence_files"
  | "terraform_plans"
  | "terraform_resource_changes"
  | "iac_scan_findings"
  | "evidence_links";

interface FakeRow {
  id: string;
  [key: string]: unknown;
}

const createFakeSupabaseClient = () => {
  const client = {
    nextIds: {
      deployment_runs: 1,
      evidence_links: 1,
      iac_scan_findings: 1,
      raw_evidence_files: 1,
      terraform_plans: 1,
      terraform_resource_changes: 1,
    },
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
      terraform_plans: [] as FakeRow[],
      terraform_resource_changes: [] as FakeRow[],
      iac_scan_findings: [] as FakeRow[],
      evidence_links: [] as FakeRow[],
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
  private onConflict: string | undefined;

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

  upsert(payload: unknown, options?: { onConflict?: string }): this {
    this.operation = "upsert";
    this.payload = payload;
    this.onConflict = options?.onConflict;
    return this;
  }

  single(): Promise<{
    data: FakeRow | null;
    error: { message: string } | null;
  }> {
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

    return Promise.resolve({
      data: this.projectRow(row),
      error: row ? null : { message: "No rows found" },
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
    const data =
      this.operation === "upsert"
        ? this.upsertRows(this.payload).map((row) =>
            this.projectRequiredRow(row),
          )
        : [];

    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }

  private upsertRows(payload: unknown): FakeRow[] {
    const rows = Array.isArray(payload) ? payload : [payload];

    return rows.map((row) => {
      const writableRow = row as Record<string, unknown>;
      const existingRow = this.findExistingRow(writableRow);

      if (existingRow) {
        Object.assign(existingRow, writableRow);
        return existingRow;
      }

      const storedRow = {
        id: this.nextId(),
        ...writableRow,
      };

      this.client.tables[this.table].push(storedRow);

      return storedRow;
    });
  }

  private findExistingRow(row: Record<string, unknown>): FakeRow | undefined {
    const conflictColumns =
      this.onConflict
        ?.split(",")
        .map((column) => column.trim())
        .filter(Boolean) ?? [];

    if (conflictColumns.length === 0) {
      return undefined;
    }

    return this.client.tables[this.table].find((candidate) =>
      conflictColumns.every((column) => candidate[column] === row[column]),
    );
  }

  private nextId(): string {
    const nextId = this.client.nextIds[
      this.table as keyof typeof this.client.nextIds
    ]++;

    switch (this.table) {
      case "deployment_runs":
        return `run-${nextId}`;
      case "raw_evidence_files":
        return `raw-evidence-${nextId}`;
      case "terraform_plans":
        return `terraform-plan-${nextId}`;
      case "terraform_resource_changes":
        return `terraform-resource-change-${nextId}`;
      case "iac_scan_findings":
        return `iac-scan-finding-${nextId}`;
      case "evidence_links":
        return `evidence-link-${nextId}`;
      default:
        return `row-${nextId}`;
    }
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
