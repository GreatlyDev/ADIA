export type DeploymentStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type DeploymentSource = "github_actions" | "manual" | "fixture";

export type TerraformResourceAction =
  | "create"
  | "update"
  | "delete"
  | "replace"
  | "no_op";

export type IacScanner = "checkov" | "tfsec" | "custom";

export type IacFindingStatus = "failed" | "passed" | "skipped" | "unknown";

export type RecommendationStatus =
  | "open"
  | "accepted"
  | "dismissed"
  | "resolved";

export interface DeploymentRun {
  id: string;
  projectId: string;
  name: string;
  status: DeploymentStatus;
  environment: string;
  source: DeploymentSource;
  startedAt: string;
  commitSha?: string;
  completedAt?: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface TerraformResourceChange {
  id: string;
  deploymentRunId: string;
  address: string;
  type: string;
  name: string;
  actions: TerraformResourceAction[];
  providerName?: string;
  moduleAddress?: string;
  riskFlags?: string[];
  evidencePath?: string;
  changeSummary?: string;
}

export interface TerraformPlanSummary {
  id: string;
  deploymentRunId: string;
  creates: number;
  updates: number;
  deletes: number;
  replacements: number;
  riskyResourceCount: number;
  iamChangeCount: number;
  networkingChangeCount: number;
  publicExposureCount: number;
  resourceChanges: TerraformResourceChange[];
}

export interface IacScanFinding {
  id: string;
  deploymentRunId: string;
  scanner: IacScanner;
  status: IacFindingStatus;
  severity: Severity;
  checkId: string;
  title: string;
  resource?: string;
  filePath?: string;
  guideline?: string;
  evidenceRefs: string[];
}

export interface Anomaly {
  id: string;
  deploymentRunId: string;
  severity: Severity;
  title: string;
  summary: string;
  evidenceRefs: string[];
  detectedAt: string;
  category?: string;
}

export interface Insight {
  id: string;
  deploymentRunId: string;
  severity: Severity;
  title: string;
  summary: string;
  evidenceRefs: string[];
  createdAt: string;
  model?: string;
}

export interface Recommendation {
  id: string;
  deploymentRunId: string;
  severity: Severity;
  title: string;
  summary: string;
  evidenceRefs: string[];
  status: RecommendationStatus;
  createdAt: string;
}
