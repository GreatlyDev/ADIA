import type { Anomaly, IacScanFinding, TerraformPlanSummary } from "@adia/core";

export interface AnomalyEngineInput {
  deploymentRunId: string;
  terraformPlanSummary?: TerraformPlanSummary;
  iacScanFindings?: IacScanFinding[];
}

export function detectAnomalies({
  deploymentRunId,
  terraformPlanSummary,
  iacScanFindings,
}: AnomalyEngineInput): Anomaly[] {
  void deploymentRunId;
  void terraformPlanSummary;
  void iacScanFindings;

  // TODO(Phase 4): Add deterministic anomaly rules for status drift, duration
  // drift, high-risk Terraform changes, scanner spikes, and exposure changes.
  return [];
}
