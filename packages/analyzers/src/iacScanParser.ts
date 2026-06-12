import type { IacFindingStatus, IacScanFinding, Severity } from "@adia/core";

export interface IacScanParserInput {
  organizationId: string;
  deploymentRunId: string;
  scanner: "checkov";
  scan: unknown;
}

interface CheckovResultGroup {
  key: string;
  status: IacFindingStatus;
}

type CheckovCheck = Record<string, unknown> & {
  check_id?: unknown;
  bc_check_id?: unknown;
  check_name?: unknown;
  severity?: unknown;
  file_path?: unknown;
  file_abs_path?: unknown;
  resource?: unknown;
  guideline?: unknown;
};

const CHECKOV_RESULT_GROUPS: CheckovResultGroup[] = [
  { key: "failed_checks", status: "failed" },
  { key: "passed_checks", status: "passed" },
  { key: "skipped_checks", status: "skipped" },
  { key: "unknown_checks", status: "unknown" },
];

export function parseIacScanFindings({
  organizationId,
  deploymentRunId,
  scanner,
  scan,
}: IacScanParserInput): IacScanFinding[] {
  const results = recordValue(recordValue(scan)?.results);
  const findings: IacScanFinding[] = [];

  if (!results) {
    return findings;
  }

  for (const group of CHECKOV_RESULT_GROUPS) {
    const checks = results[group.key];

    if (!Array.isArray(checks)) {
      continue;
    }

    checks.forEach((check, sourceIndex) => {
      const checkRecord = recordValue(check) as CheckovCheck | null;

      if (!checkRecord) {
        return;
      }

      const outputIndex = findings.length;
      const checkId =
        stringValue(checkRecord.check_id) ??
        stringValue(checkRecord.bc_check_id) ??
        `unknown_check_${outputIndex}`;
      const title =
        stringValue(checkRecord.check_name) ?? `Checkov finding ${checkId}`;

      findings.push({
        id: `iac_finding_${deploymentRunId}_${outputIndex}`,
        organizationId,
        deploymentRunId,
        scanner,
        status: group.status,
        severity: normalizeSeverity(checkRecord.severity),
        checkId,
        title,
        evidenceRefs: [`results.${group.key}[${sourceIndex}]`],
        resource: stringValue(checkRecord.resource),
        filePath:
          stringValue(checkRecord.file_path) ??
          stringValue(checkRecord.file_abs_path),
        guideline: stringValue(checkRecord.guideline),
      });
    });
  }

  return findings;
}

function normalizeSeverity(value: unknown): Severity {
  if (typeof value !== "string") {
    return "info";
  }

  switch (value.trim().toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    case "info":
    case "informational":
    default:
      return "info";
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
