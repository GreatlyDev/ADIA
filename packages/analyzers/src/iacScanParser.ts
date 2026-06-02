import type { IacScanFinding } from "@adia/core";

export interface IacScanParserInput {
  deploymentRunId: string;
  scanner: "checkov";
  scan: unknown;
}

export function parseIacScanFindings({
  deploymentRunId,
  scanner,
  scan,
}: IacScanParserInput): IacScanFinding[] {
  void deploymentRunId;
  void scanner;
  void scan;

  // TODO(Phase 3): Normalize Checkov JSON findings into shared ADIA finding
  // records with resource references, severities, and evidence links.
  return [];
}
