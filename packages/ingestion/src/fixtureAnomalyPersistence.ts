import { detectAnomalies, type AnomalyEngineThresholds } from "@adia/analyzers";
import type {
  Anomaly,
  DeploymentRun,
  IacScanFinding,
  IacScanner,
  IacFindingStatus,
  Severity,
  TerraformPlanSummary,
  TerraformResourceAction,
  TerraformResourceChange,
} from "@adia/core";

import {
  ANOMALY_ENGINE_VERSION,
  ANOMALY_ON_CONFLICT,
  buildAnomalyEvidenceLinkRows,
  buildAnomalyWriteRows,
  parseAnomalyEvidenceRef,
  type PersistedAnomalyReference,
} from "./anomalyPersistence";
import {
  EVIDENCE_LINK_ON_CONFLICT,
  type EvidenceLinkWriteRow,
} from "./parserPersistence";

export interface FixtureAnomalyPersistenceInput {
  organizationId: string;
  deploymentRunId: string;
  anomalyEngineVersion?: string;
  detectedAt?: string;
  thresholds?: AnomalyEngineThresholds;
}

export interface FixtureAnomalyPersistenceResult {
  organizationId: string;
  deploymentRunId: string;
  anomalies: PersistedAnomalyRow[];
  evidenceLinks: PersistedEvidenceLinkRow[];
}

export interface AnomalyPersistenceSupabaseClient {
  from(table: string): unknown;
}

export interface PersistedAnomalyRow extends PersistedAnomalyReference {
  category: string | null;
  severity: Severity;
}

export interface PersistedEvidenceLinkRow {
  id: string;
  label: string;
  source_table: string;
  target_table: string;
}

export class FixtureAnomalyPersistenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "FixtureAnomalyPersistenceError";
  }
}

interface DeploymentRunReadRow {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  status: DeploymentRun["status"];
  environment: string;
  source: DeploymentRun["source"];
  started_at: string;
  commit_sha: string | null;
  branch: string | null;
  external_run_id: string | null;
  external_run_url: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
}

interface TerraformPlanReadRow {
  id: string;
  organization_id: string;
  deployment_run_id: string;
  creates: number;
  updates: number;
  deletes: number;
  replacements: number;
  risky_resource_count: number;
  iam_change_count: number;
  networking_change_count: number;
  public_exposure_count: number;
}

interface TerraformResourceChangeReadRow {
  id: string;
  organization_id: string;
  deployment_run_id: string;
  terraform_plan_id: string;
  address: string;
  type: string;
  name: string;
  actions: TerraformResourceAction[];
  provider_name: string | null;
  module_address: string | null;
  risk_flags: string[];
  evidence_path: string | null;
  change_summary: string | null;
}

interface IacScanFindingReadRow {
  id: string;
  organization_id: string;
  deployment_run_id: string;
  scanner: IacScanner;
  status: IacFindingStatus;
  severity: Severity;
  check_id: string;
  title: string;
  resource: string | null;
  file_path: string | null;
  guideline: string | null;
}

type SupabaseErrorLike = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

type QueryResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
};

export const persistFixtureAnomalies = async (
  client: AnomalyPersistenceSupabaseClient,
  input: FixtureAnomalyPersistenceInput,
): Promise<FixtureAnomalyPersistenceResult> => {
  const deploymentRunRow = await resolveDeploymentRun(client, input);
  const terraformPlanRows = await selectMany<TerraformPlanReadRow>(
    client,
    "terraform_plans",
    [
      "id",
      "organization_id",
      "deployment_run_id",
      "creates",
      "updates",
      "deletes",
      "replacements",
      "risky_resource_count",
      "iam_change_count",
      "networking_change_count",
      "public_exposure_count",
    ].join(", "),
    [
      ["organization_id", input.organizationId],
      ["deployment_run_id", input.deploymentRunId],
    ],
    "terraform_plans_read_failed",
  );

  if (terraformPlanRows.length > 1) {
    throw new FixtureAnomalyPersistenceError(
      "multiple_terraform_plans_unsupported",
      "Fixture anomaly persistence supports one Terraform plan per deployment run.",
      { count: terraformPlanRows.length },
    );
  }

  const terraformPlanRow = terraformPlanRows[0];
  const terraformResourceChangeRows = terraformPlanRow
    ? await selectMany<TerraformResourceChangeReadRow>(
        client,
        "terraform_resource_changes",
        [
          "id",
          "organization_id",
          "deployment_run_id",
          "terraform_plan_id",
          "address",
          "type",
          "name",
          "actions",
          "provider_name",
          "module_address",
          "risk_flags",
          "evidence_path",
          "change_summary",
        ].join(", "),
        [
          ["organization_id", input.organizationId],
          ["deployment_run_id", input.deploymentRunId],
          ["terraform_plan_id", terraformPlanRow.id],
        ],
        "terraform_resource_changes_read_failed",
      )
    : [];
  const iacScanFindingRows = await selectMany<IacScanFindingReadRow>(
    client,
    "iac_scan_findings",
    [
      "id",
      "organization_id",
      "deployment_run_id",
      "scanner",
      "status",
      "severity",
      "check_id",
      "title",
      "resource",
      "file_path",
      "guideline",
    ].join(", "),
    [
      ["organization_id", input.organizationId],
      ["deployment_run_id", input.deploymentRunId],
    ],
    "iac_scan_findings_read_failed",
  );
  const deploymentRun = toDeploymentRun(deploymentRunRow);
  const terraformResourceChanges = terraformResourceChangeRows
    .map(toTerraformResourceChange)
    .sort((left, right) => left.id.localeCompare(right.id));
  const terraformPlanSummary = terraformPlanRow
    ? toTerraformPlanSummary(terraformPlanRow, terraformResourceChanges)
    : undefined;
  const iacScanFindings = iacScanFindingRows
    .map(toIacScanFinding)
    .sort((left, right) => left.id.localeCompare(right.id));
  const anomalies = detectAnomalies({
    deploymentRun,
    detectedAt: input.detectedAt,
    iacScanFindings,
    terraformPlanSummary,
    terraformResourceChanges,
    thresholds: input.thresholds,
  });
  const resolvedEvidenceRefs = buildResolvedEvidenceRefs({
    deploymentRun,
    iacScanFindings,
    terraformPlanSummary,
    terraformResourceChanges,
  });

  assertEvidenceRefsResolved(anomalies, resolvedEvidenceRefs);

  const anomalyRows = buildAnomalyWriteRows(anomalies, {
    anomalyEngineVersion: input.anomalyEngineVersion ?? ANOMALY_ENGINE_VERSION,
    deploymentRunId: input.deploymentRunId,
    organizationId: input.organizationId,
  });
  const persistedAnomalies = await upsertMany<PersistedAnomalyRow>(
    client,
    "anomalies",
    anomalyRows,
    ANOMALY_ON_CONFLICT,
    "id, fingerprint, category, severity",
    "anomalies_write_failed",
  );
  const evidenceLinkRows = buildAnomalyEvidenceLinkRows(
    anomalies,
    persistedAnomalies,
    {
      anomalyEngineVersion:
        input.anomalyEngineVersion ?? ANOMALY_ENGINE_VERSION,
      deploymentRunId: input.deploymentRunId,
      organizationId: input.organizationId,
    },
  );
  const persistedEvidenceLinks = await upsertMany<PersistedEvidenceLinkRow>(
    client,
    "evidence_links",
    evidenceLinkRows,
    EVIDENCE_LINK_ON_CONFLICT,
    "id, label, source_table, target_table",
    "evidence_links_write_failed",
  );

  return {
    anomalies: persistedAnomalies,
    deploymentRunId: input.deploymentRunId,
    evidenceLinks: persistedEvidenceLinks,
    organizationId: input.organizationId,
  };
};

const resolveDeploymentRun = async (
  client: AnomalyPersistenceSupabaseClient,
  input: FixtureAnomalyPersistenceInput,
): Promise<DeploymentRunReadRow> => {
  const result = await asQueryBuilder(client.from("deployment_runs"))
    .select(
      [
        "id",
        "organization_id",
        "project_id",
        "name",
        "status",
        "environment",
        "source",
        "started_at",
        "commit_sha",
        "branch",
        "external_run_id",
        "external_run_url",
        "completed_at",
        "duration_seconds",
        "metadata",
      ].join(", "),
    )
    .eq("organization_id", input.organizationId)
    .eq("id", input.deploymentRunId)
    .single<DeploymentRunReadRow>();

  if (result.error || !result.data) {
    throw new FixtureAnomalyPersistenceError(
      "deployment_run_not_found",
      `Deployment run not found: ${input.deploymentRunId}`,
      result.error,
    );
  }

  return result.data;
};

const selectMany = async <T>(
  client: AnomalyPersistenceSupabaseClient,
  table: string,
  columns: string,
  filters: Array<[string, unknown]>,
  errorCode: string,
): Promise<T[]> => {
  let query = asQueryBuilder(client.from(table)).select(columns);

  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }

  const result = (await query) as QueryResult<T[]>;

  if (result.error || !result.data) {
    throw new FixtureAnomalyPersistenceError(
      errorCode,
      `Failed to read ${table}.`,
      result.error,
    );
  }

  return result.data;
};

const upsertMany = async <T>(
  client: AnomalyPersistenceSupabaseClient,
  table: string,
  rows: unknown[],
  onConflict: string,
  selectColumns: string,
  errorCode: string,
): Promise<T[]> => {
  if (rows.length === 0) {
    return [];
  }

  const result = (await asQueryBuilder(client.from(table))
    .upsert(rows, { onConflict })
    .select(selectColumns)) as QueryResult<T[]>;

  if (result.error || !result.data) {
    throw new FixtureAnomalyPersistenceError(
      errorCode,
      `Failed to upsert ${table}.`,
      result.error,
    );
  }

  return result.data;
};

const toDeploymentRun = (row: DeploymentRunReadRow): DeploymentRun => ({
  id: row.id,
  branch: row.branch ?? undefined,
  commitSha: row.commit_sha ?? undefined,
  completedAt: row.completed_at ?? undefined,
  durationSeconds: row.duration_seconds ?? undefined,
  environment: row.environment,
  externalRunId: row.external_run_id ?? undefined,
  externalRunUrl: row.external_run_url ?? undefined,
  metadata: row.metadata ?? undefined,
  name: row.name,
  organizationId: row.organization_id,
  projectId: row.project_id,
  source: row.source,
  startedAt: row.started_at,
  status: row.status,
});

const toTerraformPlanSummary = (
  row: TerraformPlanReadRow,
  resourceChanges: TerraformResourceChange[],
): TerraformPlanSummary => ({
  id: row.id,
  creates: row.creates,
  deletes: row.deletes,
  deploymentRunId: row.deployment_run_id,
  iamChangeCount: row.iam_change_count,
  networkingChangeCount: row.networking_change_count,
  organizationId: row.organization_id,
  publicExposureCount: row.public_exposure_count,
  replacements: row.replacements,
  resourceChanges,
  riskyResourceCount: row.risky_resource_count,
  updates: row.updates,
});

const toTerraformResourceChange = (
  row: TerraformResourceChangeReadRow,
): TerraformResourceChange => ({
  id: row.id,
  actions: row.actions,
  address: row.address,
  changeSummary: row.change_summary ?? undefined,
  deploymentRunId: row.deployment_run_id,
  evidencePath: row.evidence_path ?? undefined,
  moduleAddress: row.module_address ?? undefined,
  name: row.name,
  organizationId: row.organization_id,
  providerName: row.provider_name ?? undefined,
  riskFlags: row.risk_flags,
  terraformPlanId: row.terraform_plan_id,
  type: row.type,
});

const toIacScanFinding = (row: IacScanFindingReadRow): IacScanFinding => ({
  id: row.id,
  checkId: row.check_id,
  deploymentRunId: row.deployment_run_id,
  evidenceRefs: [],
  filePath: row.file_path ?? undefined,
  guideline: row.guideline ?? undefined,
  organizationId: row.organization_id,
  resource: row.resource ?? undefined,
  scanner: row.scanner,
  severity: row.severity,
  status: row.status,
  title: row.title,
});

const buildResolvedEvidenceRefs = (input: {
  deploymentRun: DeploymentRun;
  terraformPlanSummary?: TerraformPlanSummary;
  terraformResourceChanges: TerraformResourceChange[];
  iacScanFindings: IacScanFinding[];
}): Set<string> =>
  new Set([
    `deployment_runs:${input.deploymentRun.id}`,
    ...(input.terraformPlanSummary
      ? [`terraform_plans:${input.terraformPlanSummary.id}`]
      : []),
    ...input.terraformResourceChanges.map(
      (change) => `terraform_resource_changes:${change.id}`,
    ),
    ...input.iacScanFindings.map(
      (finding) => `iac_scan_findings:${finding.id}`,
    ),
  ]);

const assertEvidenceRefsResolved = (
  anomalies: Anomaly[],
  resolvedEvidenceRefs: Set<string>,
): void => {
  for (const anomaly of anomalies) {
    for (const evidenceRef of anomaly.evidenceRefs) {
      parseAnomalyEvidenceRef(evidenceRef);

      if (!resolvedEvidenceRefs.has(evidenceRef)) {
        throw new FixtureAnomalyPersistenceError(
          "anomaly_evidence_ref_unresolved",
          `Anomaly evidence ref was not resolved for this run: ${evidenceRef}`,
        );
      }
    }
  }
};

const asQueryBuilder = (value: unknown): QueryBuilderLike => {
  if (!isQueryBuilderLike(value)) {
    throw new FixtureAnomalyPersistenceError(
      "invalid_supabase_client",
      "Supabase client did not return a query builder.",
    );
  }

  return value;
};

interface QueryBuilderLike {
  select(columns?: string): QueryBuilderLike;
  eq(column: string, value: unknown): QueryBuilderLike;
  upsert(
    payload: unknown,
    options?: {
      onConflict?: string;
    },
  ): QueryBuilderLike;
  single<T>(): Promise<QueryResult<T>>;
  then<TResult1 = QueryResult<unknown[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<unknown[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}

const isQueryBuilderLike = (value: unknown): value is QueryBuilderLike =>
  typeof value === "object" &&
  value !== null &&
  "select" in value &&
  "eq" in value &&
  "upsert" in value &&
  "single" in value;
