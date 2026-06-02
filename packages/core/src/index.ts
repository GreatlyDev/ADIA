export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

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

export type EvidenceTable =
  | "deployment_runs"
  | "terraform_plans"
  | "terraform_resource_changes"
  | "iac_scan_findings"
  | "anomalies"
  | "insights"
  | "recommendations";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  defaultEnvironment: string;
  createdAt: string;
  updatedAt: string;
  repositoryUrl?: string;
}

export interface DeploymentRun {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  status: DeploymentStatus;
  environment: string;
  source: DeploymentSource;
  startedAt: string;
  commitSha?: string;
  branch?: string;
  externalRunId?: string;
  externalRunUrl?: string;
  completedAt?: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface TerraformResourceChange {
  id: string;
  organizationId: string;
  terraformPlanId: string;
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
  organizationId: string;
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
  organizationId: string;
  deploymentRunId: string;
  scanner: IacScanner;
  status: IacFindingStatus;
  severity: Severity;
  checkId: string;
  title: string;
  evidenceRefs: string[];
  resource?: string;
  filePath?: string;
  guideline?: string;
}

export interface Anomaly {
  id: string;
  organizationId: string;
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
  organizationId: string;
  deploymentRunId: string;
  severity: Severity;
  title: string;
  summary: string;
  evidenceRefs: string[];
  createdAt: string;
  model?: string;
  structuredOutput?: Record<string, unknown>;
}

export interface Recommendation {
  id: string;
  organizationId: string;
  deploymentRunId: string;
  severity: Severity;
  title: string;
  summary: string;
  evidenceRefs: string[];
  status: RecommendationStatus;
  createdAt: string;
}

export interface EvidenceLink {
  id: string;
  organizationId: string;
  deploymentRunId?: string;
  sourceTable: EvidenceTable;
  sourceId: string;
  targetTable: EvidenceTable;
  targetId: string;
  createdAt: string;
  label?: string;
  metadata?: Record<string, unknown>;
}
