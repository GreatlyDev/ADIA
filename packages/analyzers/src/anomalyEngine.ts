import type {
  Anomaly,
  DeploymentRun,
  IacScanFinding,
  Severity,
  TerraformPlanSummary,
  TerraformResourceChange,
} from "@adia/core";

export interface AnomalyEngineThresholds {
  longDurationSeconds?: number;
  blastRadiusResourceChanges?: number;
  destructiveChangeCount?: number;
  failedIacFindingCount?: number;
}

export interface AnomalyEngineInput {
  deploymentRun: DeploymentRun;
  terraformPlanSummary?: TerraformPlanSummary;
  terraformResourceChanges?: TerraformResourceChange[];
  iacScanFindings?: IacScanFinding[];
  detectedAt?: string;
  thresholds?: AnomalyEngineThresholds;
}

interface AnomalyDraft {
  severity: Severity;
  category: string;
  title: string;
  summary: string;
  evidenceRefs: string[];
}

const DEFAULT_THRESHOLDS: Required<AnomalyEngineThresholds> = {
  blastRadiusResourceChanges: 10,
  destructiveChangeCount: 3,
  failedIacFindingCount: 3,
  longDurationSeconds: 1_800,
};

const HIGH_RISK_SEVERITIES = new Set<Severity>(["high", "critical"]);

export function detectAnomalies(input: AnomalyEngineInput): Anomaly[] {
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...input.thresholds,
  };
  const detectedAt =
    input.detectedAt ??
    input.deploymentRun.completedAt ??
    input.deploymentRun.startedAt;
  const terraformPlanSummary = getScopedTerraformPlanSummary(input);
  const terraformResourceChanges = getScopedTerraformResourceChanges(input);
  const iacScanFindings = getScopedIacScanFindings(input);
  const drafts: AnomalyDraft[] = [
    ...detectDeploymentStatusAnomalies(input.deploymentRun),
    ...detectDeploymentDurationAnomalies(input.deploymentRun, thresholds),
    ...detectTerraformPublicExposureAnomalies(
      terraformPlanSummary,
      terraformResourceChanges,
    ),
    ...detectTerraformBlastRadiusAnomalies(
      terraformPlanSummary,
      terraformResourceChanges,
      thresholds,
    ),
    ...detectIacSeverityAnomalies(iacScanFindings),
    ...detectIacVolumeAnomalies(iacScanFindings, thresholds),
  ];

  return drafts.map((draft, index) => ({
    id: `anomaly_${input.deploymentRun.id}_${index}`,
    organizationId: input.deploymentRun.organizationId,
    deploymentRunId: input.deploymentRun.id,
    severity: draft.severity,
    title: draft.title,
    summary: draft.summary,
    evidenceRefs: uniqueEvidenceRefs(draft.evidenceRefs),
    detectedAt,
    category: draft.category,
  }));
}

const detectDeploymentStatusAnomalies = (
  deploymentRun: DeploymentRun,
): AnomalyDraft[] => {
  if (
    deploymentRun.status !== "failed" &&
    deploymentRun.status !== "canceled"
  ) {
    return [];
  }

  const failed = deploymentRun.status === "failed";

  return [
    {
      severity: failed ? "high" : "medium",
      category: "deployment_status",
      title: failed ? "Deployment failed" : "Deployment canceled",
      summary: `${deploymentRun.name} ended with ${deploymentRun.status} status in ${deploymentRun.environment}.`,
      evidenceRefs: [deploymentEvidenceRef(deploymentRun)],
    },
  ];
};

const detectDeploymentDurationAnomalies = (
  deploymentRun: DeploymentRun,
  thresholds: Required<AnomalyEngineThresholds>,
): AnomalyDraft[] => {
  if (
    typeof deploymentRun.durationSeconds !== "number" ||
    deploymentRun.durationSeconds < thresholds.longDurationSeconds
  ) {
    return [];
  }

  return [
    {
      severity: "medium",
      category: "deployment_duration",
      title: "Deployment duration exceeded threshold",
      summary: `${deploymentRun.name} ran for ${deploymentRun.durationSeconds} seconds, exceeding the ${thresholds.longDurationSeconds} second deterministic threshold.`,
      evidenceRefs: [deploymentEvidenceRef(deploymentRun)],
    },
  ];
};

const detectTerraformPublicExposureAnomalies = (
  terraformPlanSummary: TerraformPlanSummary | undefined,
  terraformResourceChanges: TerraformResourceChange[],
): AnomalyDraft[] => {
  const exposedChanges = terraformResourceChanges.filter((change) =>
    change.riskFlags?.includes("public_exposure"),
  );
  const exposureCount =
    terraformPlanSummary?.publicExposureCount ?? exposedChanges.length;

  if (exposureCount <= 0) {
    return [];
  }

  return [
    {
      severity: "critical",
      category: "terraform_public_exposure",
      title: "Public exposure introduced by Terraform plan",
      summary: `Terraform evidence includes ${exposureCount} public exposure signal${pluralize(exposureCount)} that should be reviewed before promotion.`,
      evidenceRefs: [
        ...terraformPlanEvidenceRefs(terraformPlanSummary),
        ...terraformResourceChangeEvidenceRefs(exposedChanges),
      ],
    },
  ];
};

const detectTerraformBlastRadiusAnomalies = (
  terraformPlanSummary: TerraformPlanSummary | undefined,
  terraformResourceChanges: TerraformResourceChange[],
  thresholds: Required<AnomalyEngineThresholds>,
): AnomalyDraft[] => {
  const destructiveChanges = terraformResourceChanges.filter((change) =>
    change.actions.some(
      (action) => action === "delete" || action === "replace",
    ),
  );
  const destructiveCount =
    terraformPlanSummary && terraformPlanSummary.resourceChanges.length === 0
      ? terraformPlanSummary.deletes + terraformPlanSummary.replacements
      : destructiveChanges.length;
  const resourceChangeCount =
    terraformResourceChanges.length ||
    terraformPlanSummary?.resourceChanges.length ||
    0;

  if (
    destructiveCount < thresholds.destructiveChangeCount &&
    resourceChangeCount < thresholds.blastRadiusResourceChanges
  ) {
    return [];
  }

  return [
    {
      severity:
        destructiveCount >= thresholds.destructiveChangeCount
          ? "high"
          : "medium",
      category: "terraform_blast_radius",
      title: "Terraform plan has broad destructive impact",
      summary: `Terraform evidence includes ${destructiveCount} destructive change${pluralize(destructiveCount)} across ${resourceChangeCount} resource change${pluralize(resourceChangeCount)}.`,
      evidenceRefs: [
        ...terraformPlanEvidenceRefs(terraformPlanSummary),
        ...terraformResourceChangeEvidenceRefs(
          destructiveChanges.length > 0
            ? destructiveChanges
            : terraformResourceChanges,
        ),
      ],
    },
  ];
};

const detectIacSeverityAnomalies = (
  iacScanFindings: IacScanFinding[],
): AnomalyDraft[] => {
  const highRiskFailures = iacScanFindings.filter(
    (finding) =>
      finding.status === "failed" && HIGH_RISK_SEVERITIES.has(finding.severity),
  );

  if (highRiskFailures.length === 0) {
    return [];
  }

  const severity: Severity = highRiskFailures.some(
    (finding) => finding.severity === "critical",
  )
    ? "critical"
    : "high";

  return [
    {
      severity,
      category: "iac_failed_severity",
      title: "High-severity IaC scan failures detected",
      summary: `${highRiskFailures.length} failed IaC scan finding${pluralize(highRiskFailures.length)} matched high or critical severity.`,
      evidenceRefs: iacScanFindingEvidenceRefs(highRiskFailures),
    },
  ];
};

const detectIacVolumeAnomalies = (
  iacScanFindings: IacScanFinding[],
  thresholds: Required<AnomalyEngineThresholds>,
): AnomalyDraft[] => {
  const failedFindings = iacScanFindings.filter(
    (finding) => finding.status === "failed",
  );

  if (failedFindings.length < thresholds.failedIacFindingCount) {
    return [];
  }

  return [
    {
      severity: "medium",
      category: "iac_failed_count",
      title: "Multiple failed IaC scan findings detected",
      summary: `${failedFindings.length} IaC scan findings failed, meeting or exceeding the ${thresholds.failedIacFindingCount} finding deterministic threshold.`,
      evidenceRefs: iacScanFindingEvidenceRefs(failedFindings),
    },
  ];
};

const getScopedTerraformPlanSummary = ({
  deploymentRun,
  terraformPlanSummary,
}: AnomalyEngineInput): TerraformPlanSummary | undefined =>
  terraformPlanSummary &&
  terraformPlanSummary.organizationId === deploymentRun.organizationId &&
  terraformPlanSummary.deploymentRunId === deploymentRun.id
    ? terraformPlanSummary
    : undefined;

const getScopedTerraformResourceChanges = ({
  deploymentRun,
  terraformPlanSummary,
  terraformResourceChanges,
}: AnomalyEngineInput): TerraformResourceChange[] =>
  (terraformResourceChanges ?? terraformPlanSummary?.resourceChanges ?? [])
    .filter(
      (change) =>
        change.organizationId === deploymentRun.organizationId &&
        change.deploymentRunId === deploymentRun.id,
    )
    .sort((left, right) => left.id.localeCompare(right.id));

const getScopedIacScanFindings = ({
  deploymentRun,
  iacScanFindings,
}: AnomalyEngineInput): IacScanFinding[] =>
  (iacScanFindings ?? [])
    .filter(
      (finding) =>
        finding.organizationId === deploymentRun.organizationId &&
        finding.deploymentRunId === deploymentRun.id,
    )
    .sort((left, right) => left.id.localeCompare(right.id));

const deploymentEvidenceRef = (deploymentRun: DeploymentRun): string =>
  `deployment_runs:${deploymentRun.id}`;

const terraformPlanEvidenceRefs = (
  terraformPlanSummary: TerraformPlanSummary | undefined,
): string[] =>
  terraformPlanSummary ? [`terraform_plans:${terraformPlanSummary.id}`] : [];

const terraformResourceChangeEvidenceRefs = (
  terraformResourceChanges: TerraformResourceChange[],
): string[] =>
  terraformResourceChanges.map(
    (change) => `terraform_resource_changes:${change.id}`,
  );

const iacScanFindingEvidenceRefs = (
  iacScanFindings: IacScanFinding[],
): string[] =>
  iacScanFindings.map((finding) => `iac_scan_findings:${finding.id}`);

const uniqueEvidenceRefs = (evidenceRefs: string[]): string[] => [
  ...new Set(evidenceRefs),
];

const pluralize = (count: number): string => (count === 1 ? "" : "s");
