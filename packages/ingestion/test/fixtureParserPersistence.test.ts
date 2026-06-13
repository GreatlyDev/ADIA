import { describe, expect, it } from "vitest";

import type { IacScanFinding, TerraformPlanSummary } from "@adia/core";

import {
  ParsedFixtureEvidencePersistenceError,
  persistParsedFixtureEvidence,
} from "../src/fixtureParserPersistence";

const terraformSummary = (): TerraformPlanSummary => ({
  id: "tf_plan_run-1",
  organizationId: "org-1",
  deploymentRunId: "run-1",
  creates: 1,
  updates: 0,
  deletes: 0,
  replacements: 1,
  riskyResourceCount: 1,
  iamChangeCount: 1,
  networkingChangeCount: 0,
  publicExposureCount: 0,
  resourceChanges: [
    {
      id: "tf_change_run-1_0",
      organizationId: "org-1",
      terraformPlanId: "tf_plan_run-1",
      deploymentRunId: "run-1",
      address: "aws_iam_role.deploy",
      type: "aws_iam_role",
      name: "deploy",
      actions: ["replace"],
      providerName: "registry.terraform.io/hashicorp/aws",
      riskFlags: ["iam_change"],
      evidencePath: "resource_changes[0]",
      changeSummary:
        "aws_iam_role aws_iam_role.deploy will replace with iam_change",
    },
  ],
});

const checkovFindings = (): IacScanFinding[] => [
  {
    id: "iac_finding_run-1_0",
    organizationId: "org-1",
    deploymentRunId: "run-1",
    scanner: "checkov",
    status: "failed",
    severity: "high",
    checkId: "CKV_AWS_24",
    title: "Ensure no security groups allow ingress from 0.0.0.0/0 to port 22",
    evidenceRefs: ["results.failed_checks[0]"],
    resource: "aws_security_group.web",
    filePath: "/main.tf",
    guideline: "https://docs.bridgecrew.io/docs/networking_1-port-security",
  },
];

describe("persistParsedFixtureEvidence", () => {
  it("upserts parsed Terraform, Checkov, and evidence-link rows from existing raw evidence files", async () => {
    const client = createFakeSupabaseClient();

    const result = await persistParsedFixtureEvidence(client, {
      checkov: {
        findings: checkovFindings(),
        sourceEvidencePath: "checkov/demo-checkov.json",
      },
      deploymentRunId: "run-1",
      organizationId: "org-1",
      terraform: {
        sourceEvidencePath: "terraform-plans/demo-plan.json",
        summary: terraformSummary(),
      },
    });

    expect(result).toEqual({
      evidenceLinks: [
        {
          id: "evidence-link-1",
          label: "parsed_from",
          source_table: "raw_evidence_files",
          target_table: "terraform_plans",
        },
        {
          id: "evidence-link-2",
          label: "contains_change",
          source_table: "terraform_plans",
          target_table: "terraform_resource_changes",
        },
        {
          id: "evidence-link-3",
          label: "reported_by",
          source_table: "raw_evidence_files",
          target_table: "iac_scan_findings",
        },
      ],
      iacScanFindings: [
        {
          fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
          id: "iac-scan-finding-1",
        },
      ],
      terraformPlan: {
        id: "terraform-plan-1",
        resourceChanges: [
          {
            fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
            id: "terraform-resource-change-1",
          },
        ],
      },
    });

    expect(client.tables.terraform_plans).toHaveLength(1);
    expect(client.tables.terraform_resource_changes).toHaveLength(1);
    expect(client.tables.iac_scan_findings).toHaveLength(1);
    expect(client.tables.evidence_links).toHaveLength(3);
    expect(client.upserts.map((call) => call.onConflict)).toEqual([
      "deployment_run_id,source_evidence_file_id,parser_version",
      "terraform_plan_id,fingerprint",
      "deployment_run_id,source_evidence_file_id,scanner,fingerprint",
      "organization_id,source_table,source_id,target_table,target_id,label",
    ]);
  });

  it("replays the same parsed fixture output without duplicating rows", async () => {
    const client = createFakeSupabaseClient();
    const input = {
      checkov: {
        findings: checkovFindings(),
        sourceEvidencePath: "checkov/demo-checkov.json",
      },
      deploymentRunId: "run-1",
      organizationId: "org-1",
      terraform: {
        sourceEvidencePath: "terraform-plans/demo-plan.json",
        summary: terraformSummary(),
      },
    };

    await persistParsedFixtureEvidence(client, input);
    await persistParsedFixtureEvidence(client, input);

    expect(client.tables.terraform_plans).toHaveLength(1);
    expect(client.tables.terraform_resource_changes).toHaveLength(1);
    expect(client.tables.iac_scan_findings).toHaveLength(1);
    expect(client.tables.evidence_links).toHaveLength(3);
  });

  it("rejects missing raw evidence before writing parser output", async () => {
    const client = createFakeSupabaseClient();
    client.tables.raw_evidence_files = [];

    await expect(
      persistParsedFixtureEvidence(client, {
        deploymentRunId: "run-1",
        organizationId: "org-1",
        terraform: {
          sourceEvidencePath: "terraform-plans/demo-plan.json",
          summary: terraformSummary(),
        },
      }),
    ).rejects.toBeInstanceOf(ParsedFixtureEvidencePersistenceError);

    await expect(
      persistParsedFixtureEvidence(client, {
        deploymentRunId: "run-1",
        organizationId: "org-1",
        terraform: {
          sourceEvidencePath: "terraform-plans/demo-plan.json",
          summary: terraformSummary(),
        },
      }),
    ).rejects.toMatchObject({
      code: "source_evidence_not_found",
    });

    expect(client.tables.terraform_plans).toHaveLength(0);
    expect(client.tables.terraform_resource_changes).toHaveLength(0);
    expect(client.tables.evidence_links).toHaveLength(0);
  });
});

type FakeTableName =
  | "raw_evidence_files"
  | "terraform_plans"
  | "terraform_resource_changes"
  | "iac_scan_findings"
  | "evidence_links";

interface FakeRow {
  id: string;
  [key: string]: unknown;
}

interface FakeUpsertCall {
  table: FakeTableName;
  onConflict?: string;
}

const createFakeSupabaseClient = () => {
  const client = {
    nextIds: {
      evidence_links: 1,
      iac_scan_findings: 1,
      terraform_plans: 1,
      terraform_resource_changes: 1,
    },
    tables: {
      raw_evidence_files: [
        {
          id: "raw-evidence-plan-1",
          organization_id: "org-1",
          deployment_run_id: "run-1",
          kind: "terraform_plan",
          format: "terraform_show_json",
          path: "terraform-plans/demo-plan.json",
          content_sha256: "a".repeat(64),
        },
        {
          id: "raw-evidence-checkov-1",
          organization_id: "org-1",
          deployment_run_id: "run-1",
          kind: "iac_scan",
          format: "checkov_json",
          path: "checkov/demo-checkov.json",
          content_sha256: "b".repeat(64),
        },
      ] as FakeRow[],
      terraform_plans: [] as FakeRow[],
      terraform_resource_changes: [] as FakeRow[],
      iac_scan_findings: [] as FakeRow[],
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

  upsert(
    payload: unknown,
    options?: {
      onConflict?: string;
    },
  ): this {
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
