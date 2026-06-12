import { readFileSync } from "node:fs";
import type { IacFindingStatus, Severity } from "@adia/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseIacScanFindings } from "../src/iacScanParser";

describe("parseIacScanFindings", () => {
  it("normalizes failed, passed, skipped, and unknown Checkov findings", () => {
    const findings = parseIacScanFindings({
      organizationId: "org_test_001",
      deploymentRunId: "run_test_001",
      scanner: "checkov",
      scan: {
        results: {
          failed_checks: [
            {
              check_id: "CKV_AWS_18",
              check_name: "Ensure the S3 bucket has access logging enabled",
              severity: "LOW",
              file_path: "infra/modules/demo_aws_stack/main.tf",
              resource: "aws_s3_bucket.app_logs",
              guideline: "https://example.test/checkov/CKV_AWS_18",
            },
            {
              check_id: "CKV_AWS_999",
              check_name: "Critical demo finding",
              severity: "critical",
              file_path: "infra/modules/demo_aws_stack/network.tf",
              resource: "aws_security_group.web",
            },
          ],
          passed_checks: [
            {
              check_id: "CKV_AWS_144",
              check_name: "Ensure replication is enabled",
              file_path: "infra/modules/demo_aws_stack/main.tf",
              resource: "aws_s3_bucket.app_logs",
            },
          ],
          skipped_checks: [
            {
              check_id: "CKV_AWS_20",
              check_name: "Ensure S3 bucket has MFA delete enabled",
              severity: "unknown-severity",
              file_path: "infra/modules/demo_aws_stack/main.tf",
              resource: "aws_s3_bucket.app_logs",
            },
          ],
          unknown_checks: [
            {
              check_id: "CKV_CUSTOM_1",
              check_name: "Custom scanner state was not classified",
              severity: "MEDIUM",
              file_path: "infra/modules/demo_aws_stack/custom.tf",
              resource: "custom_resource.demo",
            },
          ],
        },
      },
    });

    expect(findings).toHaveLength(5);
    expect(findings[0]).toMatchObject({
      id: "iac_finding_run_test_001_0",
      organizationId: "org_test_001",
      deploymentRunId: "run_test_001",
      scanner: "checkov",
      status: "failed",
      severity: "low",
      checkId: "CKV_AWS_18",
      title: "Ensure the S3 bucket has access logging enabled",
      evidenceRefs: ["results.failed_checks[0]"],
      resource: "aws_s3_bucket.app_logs",
      filePath: "infra/modules/demo_aws_stack/main.tf",
      guideline: "https://example.test/checkov/CKV_AWS_18",
    });
    expect(findings[1]).toMatchObject({
      status: "failed",
      severity: "critical",
      evidenceRefs: ["results.failed_checks[1]"],
    });
    expect(findings[2]).toMatchObject({
      status: "passed",
      severity: "info",
      evidenceRefs: ["results.passed_checks[0]"],
    });
    expect(findings[3]).toMatchObject({
      status: "skipped",
      severity: "info",
      evidenceRefs: ["results.skipped_checks[0]"],
    });
    expect(findings[4]).toMatchObject({
      status: "unknown",
      severity: "medium",
      evidenceRefs: ["results.unknown_checks[0]"],
    });
  });

  it("returns no findings for missing or invalid result arrays", () => {
    const findings = parseIacScanFindings({
      organizationId: "org_test_001",
      deploymentRunId: "run_empty_001",
      scanner: "checkov",
      scan: {
        results: {
          failed_checks: "not-an-array",
          passed_checks: null,
        },
      },
    });

    expect(findings).toEqual([]);
  });

  it("summarizes the bundled demo Checkov fixture", () => {
    const fixtureScan = JSON.parse(
      readFileSync(
        new URL(
          "../../../scripts/fixtures/checkov/demo-checkov.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as unknown;

    const findings = parseIacScanFindings({
      organizationId: "org_fixture_001",
      deploymentRunId: "run_fixture_001",
      scanner: "checkov",
      scan: fixtureScan,
    });

    expect(findings.map((finding) => finding.status)).toEqual([
      "failed",
      "failed",
      "passed",
      "skipped",
      "unknown",
    ]);
    expect(findings.map((finding) => finding.severity)).toEqual([
      "low",
      "high",
      "info",
      "info",
      "medium",
    ]);
  });

  it("preserves status, severity, and evidence invariants for generated Checkov results", () => {
    const statusToResultKey: Record<IacFindingStatus, string> = {
      failed: "failed_checks",
      passed: "passed_checks",
      skipped: "skipped_checks",
      unknown: "unknown_checks",
    };
    const allowedSeverities: Severity[] = [
      "info",
      "low",
      "medium",
      "high",
      "critical",
    ];

    const checkArb = fc.record({
      status: fc.constantFrom<IacFindingStatus>(
        "failed",
        "passed",
        "skipped",
        "unknown",
      ),
      severity: fc.option(
        fc.constantFrom("INFO", "LOW", "medium", "High", "CRITICAL", "weird"),
        { nil: undefined },
      ),
      index: fc.nat({ max: 1000 }),
    });

    fc.assert(
      fc.property(fc.array(checkArb, { maxLength: 30 }), (checks) => {
        const results: Record<string, unknown[]> = {
          failed_checks: [],
          passed_checks: [],
          skipped_checks: [],
          unknown_checks: [],
        };

        checks.forEach((check, index) => {
          results[statusToResultKey[check.status]]?.push({
            check_id: `CKV_GENERATED_${check.index}_${index}`,
            check_name: `Generated ${check.status} check ${index}`,
            severity: check.severity,
            file_path: `infra/generated/${index}.tf`,
            resource: `generated.resource_${index}`,
          });
        });

        const findings = parseIacScanFindings({
          organizationId: "org_property_001",
          deploymentRunId: "run_property_001",
          scanner: "checkov",
          scan: { results },
        });

        expect(findings).toHaveLength(checks.length);
        expect(new Set(findings.map((finding) => finding.id)).size).toBe(
          findings.length,
        );

        for (const status of [
          "failed",
          "passed",
          "skipped",
          "unknown",
        ] as const) {
          expect(
            findings.filter((finding) => finding.status === status),
          ).toHaveLength(
            checks.filter((check) => check.status === status).length,
          );
        }

        findings.forEach((finding) => {
          expect(finding.organizationId).toBe("org_property_001");
          expect(finding.deploymentRunId).toBe("run_property_001");
          expect(finding.scanner).toBe("checkov");
          expect(allowedSeverities).toContain(finding.severity);
          expect(finding.evidenceRefs).toHaveLength(1);
          expect(finding.evidenceRefs[0]).toMatch(
            /^results\.(failed|passed|skipped|unknown)_checks\[\d+\]$/,
          );
        });
      }),
      { numRuns: 100 },
    );
  });
});
