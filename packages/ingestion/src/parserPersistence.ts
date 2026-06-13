import { createHash } from "node:crypto";

import type {
  EvidenceTable,
  IacScanFinding,
  TerraformPlanSummary,
  TerraformResourceChange,
} from "@adia/core";

export const TERRAFORM_PLAN_PARSER_VERSION = "terraform-plan-parser-v1";
export const CHECKOV_PARSER_VERSION = "checkov-parser-v1";

export const TERRAFORM_PLAN_ON_CONFLICT =
  "deployment_run_id,source_evidence_file_id,parser_version";
export const TERRAFORM_RESOURCE_CHANGE_ON_CONFLICT =
  "terraform_plan_id,fingerprint";
export const IAC_SCAN_FINDING_ON_CONFLICT =
  "deployment_run_id,source_evidence_file_id,scanner,fingerprint";
export const EVIDENCE_LINK_ON_CONFLICT =
  "organization_id,source_table,source_id,target_table,target_id,label";

export interface ParserSourceEvidence {
  id: string;
  path: string;
  contentSha256?: string | null;
}

export interface ParserPersistenceScope {
  organizationId: string;
  deploymentRunId: string;
  sourceEvidence: ParserSourceEvidence;
  parserVersion?: string;
}

export interface TerraformPlanWriteRow {
  organization_id: string;
  deployment_run_id: string;
  source_evidence_file_id: string;
  parser_version: string;
  source_content_sha256: string | null;
  raw_plan: Record<string, never>;
  summary: Record<string, unknown>;
  creates: number;
  updates: number;
  deletes: number;
  replacements: number;
  risky_resource_count: number;
  iam_change_count: number;
  networking_change_count: number;
  public_exposure_count: number;
}

export interface TerraformResourceChangeWriteRow {
  organization_id: string;
  deployment_run_id: string;
  terraform_plan_id: string;
  parser_version: string;
  fingerprint: string;
  address: string;
  type: string;
  name: string;
  actions: TerraformResourceChange["actions"];
  provider_name: string | null;
  module_address: string | null;
  risk_flags: string[];
  evidence_path: string | null;
  change_summary: string | null;
}

export interface TerraformResourceChangeWriteScope {
  organizationId: string;
  deploymentRunId: string;
  terraformPlanId: string;
  parserVersion?: string;
}

export interface IacScanFindingWriteRow {
  organization_id: string;
  deployment_run_id: string;
  source_evidence_file_id: string;
  parser_version: string;
  source_content_sha256: string | null;
  fingerprint: string;
  scanner: IacScanFinding["scanner"];
  status: IacScanFinding["status"];
  severity: IacScanFinding["severity"];
  check_id: string;
  title: string;
  resource: string | null;
  file_path: string | null;
  guideline: string | null;
  evidence_refs: string[];
  raw_finding: Record<string, unknown>;
}

export interface EvidenceLinkWriteRow {
  organization_id: string;
  deployment_run_id: string | null;
  source_table: EvidenceTable;
  source_id: string;
  target_table: EvidenceTable;
  target_id: string;
  label: string;
  metadata: Record<string, unknown>;
}

export interface EvidenceLinkWriteInput {
  organizationId: string;
  deploymentRunId?: string | null;
  sourceTable: EvidenceTable;
  sourceId: string;
  targetTable: EvidenceTable;
  targetId: string;
  label: string;
  metadata?: Record<string, unknown>;
}

export class ParserPersistenceMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParserPersistenceMappingError";
  }
}

export const buildTerraformPlanWriteRow = (
  summary: TerraformPlanSummary,
  scope: ParserPersistenceScope,
): TerraformPlanWriteRow => {
  assertScope(
    summary.organizationId,
    summary.deploymentRunId,
    scope.organizationId,
    scope.deploymentRunId,
    "Terraform summary does not match the persistence scope.",
  );

  const parserVersion = scope.parserVersion ?? TERRAFORM_PLAN_PARSER_VERSION;

  return {
    organization_id: scope.organizationId,
    deployment_run_id: scope.deploymentRunId,
    source_evidence_file_id: scope.sourceEvidence.id,
    parser_version: parserVersion,
    source_content_sha256: scope.sourceEvidence.contentSha256 ?? null,
    raw_plan: {},
    summary: {
      counts: {
        creates: summary.creates,
        updates: summary.updates,
        deletes: summary.deletes,
        replacements: summary.replacements,
        riskyResourceCount: summary.riskyResourceCount,
        iamChangeCount: summary.iamChangeCount,
        networkingChangeCount: summary.networkingChangeCount,
        publicExposureCount: summary.publicExposureCount,
      },
      parserVersion,
      resourceChangeCount: summary.resourceChanges.length,
      sourceEvidence: sourceEvidenceMetadata(scope.sourceEvidence),
    },
    creates: summary.creates,
    updates: summary.updates,
    deletes: summary.deletes,
    replacements: summary.replacements,
    risky_resource_count: summary.riskyResourceCount,
    iam_change_count: summary.iamChangeCount,
    networking_change_count: summary.networkingChangeCount,
    public_exposure_count: summary.publicExposureCount,
  };
};

export const buildTerraformResourceChangeWriteRows = (
  changes: TerraformResourceChange[],
  scope: TerraformResourceChangeWriteScope,
): TerraformResourceChangeWriteRow[] => {
  const parserVersion = scope.parserVersion ?? TERRAFORM_PLAN_PARSER_VERSION;

  return changes.map((change) => {
    assertScope(
      change.organizationId,
      change.deploymentRunId,
      scope.organizationId,
      scope.deploymentRunId,
      "Terraform resource change does not match the persistence scope.",
    );

    return {
      organization_id: scope.organizationId,
      deployment_run_id: scope.deploymentRunId,
      terraform_plan_id: scope.terraformPlanId,
      parser_version: parserVersion,
      fingerprint: fingerprintFor("terraform_resource_change", {
        actions: change.actions,
        address: change.address,
        evidencePath: change.evidencePath ?? null,
        name: change.name,
        parserVersion,
        terraformPlanId: scope.terraformPlanId,
        type: change.type,
      }),
      address: change.address,
      type: change.type,
      name: change.name,
      actions: change.actions,
      provider_name: change.providerName ?? null,
      module_address: change.moduleAddress ?? null,
      risk_flags: change.riskFlags ?? [],
      evidence_path: change.evidencePath ?? null,
      change_summary: change.changeSummary ?? null,
    };
  });
};

export const buildIacScanFindingWriteRows = (
  findings: IacScanFinding[],
  scope: ParserPersistenceScope,
): IacScanFindingWriteRow[] => {
  const parserVersion = scope.parserVersion ?? CHECKOV_PARSER_VERSION;

  return findings.map((finding) => {
    assertScope(
      finding.organizationId,
      finding.deploymentRunId,
      scope.organizationId,
      scope.deploymentRunId,
      "IaC scan finding does not match the persistence scope.",
    );

    return {
      organization_id: scope.organizationId,
      deployment_run_id: scope.deploymentRunId,
      source_evidence_file_id: scope.sourceEvidence.id,
      parser_version: parserVersion,
      source_content_sha256: scope.sourceEvidence.contentSha256 ?? null,
      fingerprint: fingerprintFor("iac_scan_finding", {
        checkId: finding.checkId,
        evidenceRefs: finding.evidenceRefs,
        filePath: finding.filePath ?? null,
        parserVersion,
        resource: finding.resource ?? null,
        scanner: finding.scanner,
        status: finding.status,
        title: finding.title,
      }),
      scanner: finding.scanner,
      status: finding.status,
      severity: finding.severity,
      check_id: finding.checkId,
      title: finding.title,
      resource: finding.resource ?? null,
      file_path: finding.filePath ?? null,
      guideline: finding.guideline ?? null,
      evidence_refs: finding.evidenceRefs,
      raw_finding: {
        evidenceRefs: finding.evidenceRefs,
        parserVersion,
        sourceEvidence: sourceEvidenceMetadata(scope.sourceEvidence),
      },
    };
  });
};

export const buildEvidenceLinkWriteRow = (
  input: EvidenceLinkWriteInput,
): EvidenceLinkWriteRow => {
  if (input.label.trim().length === 0) {
    throw new ParserPersistenceMappingError(
      "Evidence link label is required for duplicate-safe persistence.",
    );
  }

  return {
    organization_id: input.organizationId,
    deployment_run_id: input.deploymentRunId ?? null,
    source_table: input.sourceTable,
    source_id: input.sourceId,
    target_table: input.targetTable,
    target_id: input.targetId,
    label: input.label,
    metadata: input.metadata ?? {},
  };
};

const assertScope = (
  actualOrganizationId: string,
  actualDeploymentRunId: string,
  expectedOrganizationId: string,
  expectedDeploymentRunId: string,
  message: string,
): void => {
  if (
    actualOrganizationId !== expectedOrganizationId ||
    actualDeploymentRunId !== expectedDeploymentRunId
  ) {
    throw new ParserPersistenceMappingError(message);
  }
};

const sourceEvidenceMetadata = (
  sourceEvidence: ParserSourceEvidence,
): Record<string, unknown> => ({
  id: sourceEvidence.id,
  path: sourceEvidence.path,
  ...(sourceEvidence.contentSha256
    ? { contentSha256: sourceEvidence.contentSha256 }
    : {}),
});

const fingerprintFor = (kind: string, value: Record<string, unknown>): string =>
  createHash("sha256")
    .update(JSON.stringify(toStableJsonValue({ kind, ...value })))
    .digest("hex");

const toStableJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => toStableJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, toStableJsonValue(nestedValue)]),
    );
  }

  return value;
};
