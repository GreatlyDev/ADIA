import { describe, expect, it } from "vitest";

import {
  FixtureAnomalyPersistenceError,
  persistFixtureAnomalies,
} from "../src/fixtureAnomalyPersistence";

describe("persistFixtureAnomalies", () => {
  it("runs the anomaly engine over persisted parser rows and upserts anomalies with evidence links", async () => {
    const client = createFakeSupabaseClient();

    const result = await persistFixtureAnomalies(client, {
      deploymentRunId: "run-1",
      organizationId: "org-1",
      detectedAt: "2026-01-15T13:30:00.000Z",
    });

    expect(result.anomalies.map((anomaly) => anomaly.category)).toEqual([
      "deployment_status",
      "deployment_duration",
      "terraform_public_exposure",
      "iac_failed_severity",
    ]);
    expect(result.anomalies).toHaveLength(4);
    expect(result.evidenceLinks).toHaveLength(5);
    expect(client.tables.anomalies).toHaveLength(4);
    expect(client.tables.evidence_links).toHaveLength(5);
    expect(client.tables.anomalies[0]).toMatchObject({
      organization_id: "org-1",
      deployment_run_id: "run-1",
      anomaly_engine_version: "anomaly-engine-v1",
      category: "deployment_status",
      severity: "high",
    });
    expect(client.tables.evidence_links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_table: "deployment_runs",
          source_id: "run-1",
          target_table: "anomalies",
          label: "supports_anomaly",
        }),
        expect.objectContaining({
          source_table: "terraform_resource_changes",
          source_id: "terraform-resource-change-1",
          target_table: "anomalies",
          label: "supports_anomaly",
        }),
        expect.objectContaining({
          source_table: "iac_scan_findings",
          source_id: "iac-scan-finding-1",
          target_table: "anomalies",
          label: "supports_anomaly",
        }),
      ]),
    );
    expect(client.upserts.map((call) => call.onConflict)).toEqual([
      "deployment_run_id,anomaly_engine_version,fingerprint",
      "organization_id,source_table,source_id,target_table,target_id,label",
    ]);
  });

  it("replays the same parser state without duplicating anomalies or evidence links", async () => {
    const client = createFakeSupabaseClient();
    const input = {
      deploymentRunId: "run-1",
      organizationId: "org-1",
      detectedAt: "2026-01-15T13:30:00.000Z",
    };

    const first = await persistFixtureAnomalies(client, input);
    const second = await persistFixtureAnomalies(client, input);

    expect(client.tables.anomalies).toHaveLength(4);
    expect(client.tables.evidence_links).toHaveLength(5);
    expect(second.anomalies.map((anomaly) => anomaly.id)).toEqual(
      first.anomalies.map((anomaly) => anomaly.id),
    );
  });

  it("returns no writes when scoped parser rows do not trigger anomaly rules", async () => {
    const client = createFakeSupabaseClient({
      deploymentRun: {
        status: "succeeded",
        duration_seconds: 120,
      },
      iacFinding: {
        severity: "low",
        status: "passed",
      },
      terraformPlan: {
        public_exposure_count: 0,
      },
      terraformResourceChange: {
        risk_flags: [],
      },
    });

    const result = await persistFixtureAnomalies(client, {
      deploymentRunId: "run-1",
      organizationId: "org-1",
    });

    expect(result).toEqual({
      anomalies: [],
      deploymentRunId: "run-1",
      evidenceLinks: [],
      organizationId: "org-1",
    });
    expect(client.tables.anomalies).toHaveLength(0);
    expect(client.tables.evidence_links).toHaveLength(0);
    expect(client.upserts).toEqual([]);
  });

  it("rejects a missing deployment run before writing anomalies", async () => {
    const client = createFakeSupabaseClient();
    client.tables.deployment_runs = [];

    await expect(
      persistFixtureAnomalies(client, {
        deploymentRunId: "run-1",
        organizationId: "org-1",
      }),
    ).rejects.toMatchObject({
      code: "deployment_run_not_found",
    });
    expect(client.tables.anomalies).toHaveLength(0);
    expect(client.tables.evidence_links).toHaveLength(0);
  });

  it("rejects multiple Terraform plans in the same fixture scope", async () => {
    const client = createFakeSupabaseClient();
    client.tables.terraform_plans.push({
      ...client.tables.terraform_plans[0],
      id: "terraform-plan-2",
    });

    await expect(
      persistFixtureAnomalies(client, {
        deploymentRunId: "run-1",
        organizationId: "org-1",
      }),
    ).rejects.toBeInstanceOf(FixtureAnomalyPersistenceError);
    await expect(
      persistFixtureAnomalies(client, {
        deploymentRunId: "run-1",
        organizationId: "org-1",
      }),
    ).rejects.toMatchObject({
      code: "multiple_terraform_plans_unsupported",
    });
    expect(client.tables.anomalies).toHaveLength(0);
    expect(client.tables.evidence_links).toHaveLength(0);
  });
});

type FakeTableName =
  | "deployment_runs"
  | "terraform_plans"
  | "terraform_resource_changes"
  | "iac_scan_findings"
  | "anomalies"
  | "evidence_links";

interface FakeRow {
  id: string;
  [key: string]: unknown;
}

interface FakeUpsertCall {
  table: FakeTableName;
  onConflict?: string;
}

interface FakeFixtureOverrides {
  deploymentRun?: Partial<FakeRow>;
  terraformPlan?: Partial<FakeRow>;
  terraformResourceChange?: Partial<FakeRow>;
  iacFinding?: Partial<FakeRow>;
}

const createFakeSupabaseClient = (overrides: FakeFixtureOverrides = {}) => {
  const client = {
    nextIds: {
      anomalies: 1,
      evidence_links: 1,
    },
    tables: {
      deployment_runs: [
        {
          id: "run-1",
          organization_id: "org-1",
          project_id: "project-1",
          name: "Deploy staging",
          status: "failed",
          environment: "staging",
          source: "github_actions",
          started_at: "2026-01-15T12:00:00.000Z",
          completed_at: "2026-01-15T12:45:00.000Z",
          duration_seconds: 2_700,
          commit_sha: "0123456789abcdef0123456789abcdef01234567",
          branch: "main",
          external_run_id: "123456789",
          external_run_url:
            "https://github.com/GreatlyDev/ADIA/actions/runs/123456789",
          metadata: {},
          ...overrides.deploymentRun,
        },
      ] as FakeRow[],
      terraform_plans: [
        {
          id: "terraform-plan-1",
          organization_id: "org-1",
          deployment_run_id: "run-1",
          creates: 1,
          updates: 1,
          deletes: 0,
          replacements: 0,
          risky_resource_count: 1,
          iam_change_count: 0,
          networking_change_count: 1,
          public_exposure_count: 1,
          ...overrides.terraformPlan,
        },
      ] as FakeRow[],
      terraform_resource_changes: [
        {
          id: "terraform-resource-change-1",
          organization_id: "org-1",
          deployment_run_id: "run-1",
          terraform_plan_id: "terraform-plan-1",
          address: "aws_security_group.web",
          type: "aws_security_group",
          name: "web",
          actions: ["update"],
          provider_name: "registry.terraform.io/hashicorp/aws",
          module_address: null,
          risk_flags: ["public_exposure", "networking_change"],
          evidence_path: "resource_changes[0]",
          change_summary:
            "aws_security_group aws_security_group.web will update with public_exposure",
          ...overrides.terraformResourceChange,
        },
      ] as FakeRow[],
      iac_scan_findings: [
        {
          id: "iac-scan-finding-1",
          organization_id: "org-1",
          deployment_run_id: "run-1",
          scanner: "checkov",
          status: "failed",
          severity: "high",
          check_id: "CKV_AWS_24",
          title:
            "Ensure no security groups allow ingress from 0.0.0.0/0 to port 22",
          resource: "aws_security_group.web",
          file_path: "/main.tf",
          guideline:
            "https://docs.bridgecrew.io/docs/networking_1-port-security",
          ...overrides.iacFinding,
        },
      ] as FakeRow[],
      anomalies: [] as FakeRow[],
      evidence_links: [] as FakeRow[],
    },
    upserts: [] as FakeUpsertCall[],
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
    this.client.upserts.push({
      table: this.table,
      onConflict: this.onConflict,
    });
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

    const row = this.filteredRows()[0] ?? null;

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
        : this.filteredRows().map((row) => this.projectRequiredRow(row));

    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }

  private filteredRows(): FakeRow[] {
    return this.client.tables[this.table].filter((candidate) =>
      Object.entries(this.filters).every(
        ([key, value]) => candidate[key] === value,
      ),
    );
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
      case "anomalies":
        return `anomaly-${nextId}`;
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
