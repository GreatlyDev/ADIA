import type {
  DeploymentRun,
  IacFindingStatus,
  IacScanFinding,
  Severity,
  TerraformPlanSummary,
  TerraformResourceAction,
  TerraformResourceChange,
} from "@adia/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { detectAnomalies } from "../src/anomalyEngine";

const allowedSeverities: Severity[] = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
];

describe("detectAnomalies", () => {
  it("detects failed deployment status and long duration anomalies", () => {
    const anomalies = detectAnomalies({
      deploymentRun: deploymentRunFixture({
        durationSeconds: 3_700,
        status: "failed",
      }),
      detectedAt: "2026-01-15T13:30:00.000Z",
    });

    expect(anomalies).toHaveLength(2);
    expect(anomalies[0]).toMatchObject({
      id: "anomaly_run_test_001_0",
      organizationId: "org_test_001",
      deploymentRunId: "run_test_001",
      severity: "high",
      category: "deployment_status",
      title: "Deployment failed",
      evidenceRefs: ["deployment_runs:run_test_001"],
      detectedAt: "2026-01-15T13:30:00.000Z",
    });
    expect(anomalies[1]).toMatchObject({
      id: "anomaly_run_test_001_1",
      severity: "medium",
      category: "deployment_duration",
      title: "Deployment duration exceeded threshold",
      evidenceRefs: ["deployment_runs:run_test_001"],
    });
  });

  it("detects Terraform public exposure, blast radius, and high-severity Checkov failures", () => {
    const terraformPlanSummary = terraformPlanSummaryFixture({
      deletes: 1,
      publicExposureCount: 1,
      replacements: 2,
      resourceChanges: [
        terraformResourceChangeFixture({
          actions: ["replace"],
          address: "module.network.aws_security_group.web",
          id: "tf_change_run_test_001_0",
          riskFlags: ["networking_change", "public_exposure"],
          type: "aws_security_group",
        }),
        terraformResourceChangeFixture({
          actions: ["replace"],
          address: "aws_iam_policy.deploy_permissions",
          id: "tf_change_run_test_001_1",
          riskFlags: ["iam_change"],
          type: "aws_iam_policy",
        }),
        terraformResourceChangeFixture({
          actions: ["delete"],
          address: "aws_db_instance.legacy",
          id: "tf_change_run_test_001_2",
          riskFlags: [],
          type: "aws_db_instance",
        }),
      ],
    });
    const findings = [
      iacScanFindingFixture({
        checkId: "CKV_AWS_24",
        id: "iac_finding_run_test_001_0",
        severity: "high",
        status: "failed",
      }),
      iacScanFindingFixture({
        checkId: "CKV_AWS_999",
        id: "iac_finding_run_test_001_1",
        severity: "critical",
        status: "failed",
      }),
      iacScanFindingFixture({
        checkId: "CKV_AWS_20",
        id: "iac_finding_run_test_001_2",
        severity: "medium",
        status: "failed",
      }),
    ];

    const anomalies = detectAnomalies({
      deploymentRun: deploymentRunFixture(),
      detectedAt: "2026-01-15T13:30:00.000Z",
      iacScanFindings: findings,
      terraformPlanSummary,
    });

    expect(anomalies.map((anomaly) => anomaly.category)).toEqual([
      "terraform_public_exposure",
      "terraform_blast_radius",
      "iac_failed_severity",
      "iac_failed_count",
    ]);
    expect(anomalies[0]).toMatchObject({
      severity: "critical",
      title: "Public exposure introduced by Terraform plan",
      evidenceRefs: [
        "terraform_plans:tf_plan_run_test_001",
        "terraform_resource_changes:tf_change_run_test_001_0",
      ],
    });
    expect(anomalies[1]).toMatchObject({
      severity: "high",
      title: "Terraform plan has broad destructive impact",
      evidenceRefs: [
        "terraform_plans:tf_plan_run_test_001",
        "terraform_resource_changes:tf_change_run_test_001_0",
        "terraform_resource_changes:tf_change_run_test_001_1",
        "terraform_resource_changes:tf_change_run_test_001_2",
      ],
    });
    expect(anomalies[2]).toMatchObject({
      severity: "critical",
      title: "High-severity IaC scan failures detected",
      evidenceRefs: [
        "iac_scan_findings:iac_finding_run_test_001_0",
        "iac_scan_findings:iac_finding_run_test_001_1",
      ],
    });
    expect(anomalies[3]).toMatchObject({
      severity: "medium",
      title: "Multiple failed IaC scan findings detected",
      evidenceRefs: [
        "iac_scan_findings:iac_finding_run_test_001_0",
        "iac_scan_findings:iac_finding_run_test_001_1",
        "iac_scan_findings:iac_finding_run_test_001_2",
      ],
    });
  });

  it("preserves anomaly invariants for generated validated fixture data", () => {
    const resourceChangeArb = fc.record({
      action: fc.constantFrom<TerraformResourceAction>(
        "create",
        "update",
        "delete",
        "replace",
      ),
      isPublic: fc.boolean(),
      isRisky: fc.boolean(),
      type: fc.constantFrom(
        "aws_s3_bucket",
        "aws_security_group",
        "aws_iam_role",
        "aws_db_instance",
      ),
    });
    const findingArb = fc.record({
      severity: fc.constantFrom<Severity>(
        "info",
        "low",
        "medium",
        "high",
        "critical",
      ),
      status: fc.constantFrom<IacFindingStatus>(
        "failed",
        "passed",
        "skipped",
        "unknown",
      ),
    });

    fc.assert(
      fc.property(
        fc.record({
          durationSeconds: fc.option(fc.integer({ min: 0, max: 8_000 }), {
            nil: undefined,
          }),
          findings: fc.array(findingArb, { maxLength: 12 }),
          resourceChanges: fc.array(resourceChangeArb, { maxLength: 12 }),
          status: fc.constantFrom<DeploymentRun["status"]>(
            "queued",
            "running",
            "succeeded",
            "failed",
            "canceled",
          ),
        }),
        (input) => {
          const deploymentRun = deploymentRunFixture({
            durationSeconds: input.durationSeconds,
            status: input.status,
          });
          const resourceChanges = input.resourceChanges.map((change, index) =>
            terraformResourceChangeFixture({
              actions: [change.action],
              address: `${change.type}.generated_${index}`,
              id: `tf_change_run_test_001_${index}`,
              riskFlags: [
                ...(change.isRisky ? ["iam_change"] : []),
                ...(change.isPublic ? ["public_exposure"] : []),
              ],
              type: change.type,
            }),
          );
          const terraformPlanSummary = terraformPlanSummaryFixture({
            deletes: resourceChanges.filter((change) =>
              change.actions.includes("delete"),
            ).length,
            publicExposureCount: resourceChanges.filter((change) =>
              change.riskFlags?.includes("public_exposure"),
            ).length,
            replacements: resourceChanges.filter((change) =>
              change.actions.includes("replace"),
            ).length,
            resourceChanges,
          });
          const iacScanFindings = input.findings.map((finding, index) =>
            iacScanFindingFixture({
              id: `iac_finding_run_test_001_${index}`,
              severity: finding.severity,
              status: finding.status,
            }),
          );

          const anomalies = detectAnomalies({
            deploymentRun,
            detectedAt: "2026-01-15T13:30:00.000Z",
            iacScanFindings,
            terraformPlanSummary,
          });
          const repeated = detectAnomalies({
            deploymentRun,
            detectedAt: "2026-01-15T13:30:00.000Z",
            iacScanFindings,
            terraformPlanSummary,
          });

          expect(repeated).toEqual(anomalies);
          expect(new Set(anomalies.map((anomaly) => anomaly.id)).size).toBe(
            anomalies.length,
          );

          anomalies.forEach((anomaly) => {
            expect(anomaly.organizationId).toBe("org_test_001");
            expect(anomaly.deploymentRunId).toBe("run_test_001");
            expect(anomaly.detectedAt).toBe("2026-01-15T13:30:00.000Z");
            expect(allowedSeverities).toContain(anomaly.severity);
            expect(anomaly.title.length).toBeGreaterThan(0);
            expect(anomaly.summary.length).toBeGreaterThan(0);
            expect(anomaly.category?.length).toBeGreaterThan(0);
            expect(anomaly.evidenceRefs.length).toBeGreaterThan(0);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});

const deploymentRunFixture = (
  overrides: Partial<DeploymentRun> = {},
): DeploymentRun => ({
  id: "run_test_001",
  organizationId: "org_test_001",
  projectId: "project_test_001",
  name: "Deploy staging",
  status: "succeeded",
  environment: "staging",
  source: "fixture",
  startedAt: "2026-01-15T12:00:00.000Z",
  completedAt: "2026-01-15T12:07:30.000Z",
  durationSeconds: 450,
  ...overrides,
});

const terraformPlanSummaryFixture = (
  overrides: Partial<TerraformPlanSummary> = {},
): TerraformPlanSummary => ({
  id: "tf_plan_run_test_001",
  organizationId: "org_test_001",
  deploymentRunId: "run_test_001",
  creates: 0,
  updates: 0,
  deletes: 0,
  replacements: 0,
  riskyResourceCount: 0,
  iamChangeCount: 0,
  networkingChangeCount: 0,
  publicExposureCount: 0,
  resourceChanges: [],
  ...overrides,
});

const terraformResourceChangeFixture = (
  overrides: Partial<TerraformResourceChange> = {},
): TerraformResourceChange => ({
  id: "tf_change_run_test_001_0",
  organizationId: "org_test_001",
  terraformPlanId: "tf_plan_run_test_001",
  deploymentRunId: "run_test_001",
  address: "aws_s3_bucket.app_logs",
  type: "aws_s3_bucket",
  name: "app_logs",
  actions: ["update"],
  riskFlags: [],
  evidencePath: "resource_changes[0]",
  ...overrides,
});

const iacScanFindingFixture = (
  overrides: Partial<IacScanFinding> = {},
): IacScanFinding => ({
  id: "iac_finding_run_test_001_0",
  organizationId: "org_test_001",
  deploymentRunId: "run_test_001",
  scanner: "checkov",
  status: "failed",
  severity: "high",
  checkId: "CKV_AWS_24",
  title: "Ensure no security groups allow broad ingress",
  evidenceRefs: ["results.failed_checks[0]"],
  resource: "aws_security_group.web",
  filePath: "infra/demo/network.tf",
  ...overrides,
});
