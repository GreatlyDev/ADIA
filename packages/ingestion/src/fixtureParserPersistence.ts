import type { IacScanFinding, TerraformPlanSummary } from "@adia/core";

import {
  CHECKOV_PARSER_VERSION,
  EVIDENCE_LINK_ON_CONFLICT,
  IAC_SCAN_FINDING_ON_CONFLICT,
  TERRAFORM_PLAN_ON_CONFLICT,
  TERRAFORM_PLAN_PARSER_VERSION,
  TERRAFORM_RESOURCE_CHANGE_ON_CONFLICT,
  buildEvidenceLinkWriteRow,
  buildIacScanFindingWriteRows,
  buildTerraformPlanWriteRow,
  buildTerraformResourceChangeWriteRows,
  type EvidenceLinkWriteRow,
  type IacScanFindingWriteRow,
  type ParserSourceEvidence,
  type TerraformResourceChangeWriteRow,
} from "./parserPersistence";

export interface ParsedFixtureEvidencePersistenceInput {
  organizationId: string;
  deploymentRunId: string;
  terraform?: {
    summary: TerraformPlanSummary;
    sourceEvidencePath: string;
  };
  checkov?: {
    findings: IacScanFinding[];
    sourceEvidencePath: string;
  };
}

export interface ParsedFixtureEvidencePersistenceResult {
  terraformPlan?: {
    id: string;
    resourceChanges: PersistedFingerprintRow[];
  };
  iacScanFindings: PersistedFingerprintRow[];
  evidenceLinks: PersistedEvidenceLinkRow[];
}

export interface ParserPersistenceSupabaseClient {
  from(table: string): unknown;
}

export class ParsedFixtureEvidencePersistenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ParsedFixtureEvidencePersistenceError";
  }
}

interface RawEvidenceFileReadRow {
  id: string;
  organization_id: string;
  deployment_run_id: string;
  kind: "terraform_plan" | "iac_scan" | "log";
  format: "terraform_show_json" | "checkov_json" | "plain_text";
  path: string;
  content_sha256: string | null;
}

interface PersistedTerraformPlanRow {
  id: string;
}

interface PersistedFingerprintRow {
  id: string;
  fingerprint: string;
}

interface PersistedEvidenceLinkRow {
  id: string;
  label: string;
  source_table: string;
  target_table: string;
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

export const persistParsedFixtureEvidence = async (
  client: ParserPersistenceSupabaseClient,
  input: ParsedFixtureEvidencePersistenceInput,
): Promise<ParsedFixtureEvidencePersistenceResult> => {
  const evidenceLinks: EvidenceLinkWriteRow[] = [];
  let terraformPlan:
    | ParsedFixtureEvidencePersistenceResult["terraformPlan"]
    | undefined;
  let iacScanFindings: PersistedFingerprintRow[] = [];

  if (input.terraform) {
    const sourceEvidence = await resolveRawEvidenceFile(client, {
      deploymentRunId: input.deploymentRunId,
      format: "terraform_show_json",
      kind: "terraform_plan",
      organizationId: input.organizationId,
      path: input.terraform.sourceEvidencePath,
    });
    const planRow = buildTerraformPlanWriteRow(input.terraform.summary, {
      deploymentRunId: input.deploymentRunId,
      organizationId: input.organizationId,
      sourceEvidence,
    });
    const persistedPlan = await upsertSingle<PersistedTerraformPlanRow>(
      client,
      "terraform_plans",
      planRow,
      TERRAFORM_PLAN_ON_CONFLICT,
      "id",
      "terraform_plan_write_failed",
    );
    const resourceChangeRows = buildTerraformResourceChangeWriteRows(
      input.terraform.summary.resourceChanges,
      {
        deploymentRunId: input.deploymentRunId,
        organizationId: input.organizationId,
        parserVersion: TERRAFORM_PLAN_PARSER_VERSION,
        terraformPlanId: persistedPlan.id,
      },
    );
    const persistedResourceChanges = await upsertMany<PersistedFingerprintRow>(
      client,
      "terraform_resource_changes",
      resourceChangeRows,
      TERRAFORM_RESOURCE_CHANGE_ON_CONFLICT,
      "id, fingerprint",
      "terraform_resource_changes_write_failed",
    );

    evidenceLinks.push(
      buildEvidenceLinkWriteRow({
        deploymentRunId: input.deploymentRunId,
        label: "parsed_from",
        metadata: {
          parserVersion: TERRAFORM_PLAN_PARSER_VERSION,
          sourcePath: sourceEvidence.path,
          ...(sourceEvidence.contentSha256
            ? { sourceContentSha256: sourceEvidence.contentSha256 }
            : {}),
        },
        organizationId: input.organizationId,
        sourceId: sourceEvidence.id,
        sourceTable: "raw_evidence_files",
        targetId: persistedPlan.id,
        targetTable: "terraform_plans",
      }),
    );

    const changesByFingerprint = toFingerprintMap(resourceChangeRows);
    persistedResourceChanges.forEach((persistedChange) => {
      const changeRow = changesByFingerprint.get(persistedChange.fingerprint);

      evidenceLinks.push(
        buildEvidenceLinkWriteRow({
          deploymentRunId: input.deploymentRunId,
          label: "contains_change",
          metadata: {
            address: changeRow?.address ?? null,
            evidencePath: changeRow?.evidence_path ?? null,
            parserVersion: TERRAFORM_PLAN_PARSER_VERSION,
          },
          organizationId: input.organizationId,
          sourceId: persistedPlan.id,
          sourceTable: "terraform_plans",
          targetId: persistedChange.id,
          targetTable: "terraform_resource_changes",
        }),
      );
    });

    terraformPlan = {
      id: persistedPlan.id,
      resourceChanges: persistedResourceChanges,
    };
  }

  if (input.checkov) {
    const sourceEvidence = await resolveRawEvidenceFile(client, {
      deploymentRunId: input.deploymentRunId,
      format: "checkov_json",
      kind: "iac_scan",
      organizationId: input.organizationId,
      path: input.checkov.sourceEvidencePath,
    });
    const findingRows = buildIacScanFindingWriteRows(input.checkov.findings, {
      deploymentRunId: input.deploymentRunId,
      organizationId: input.organizationId,
      parserVersion: CHECKOV_PARSER_VERSION,
      sourceEvidence,
    });
    iacScanFindings = await upsertMany<PersistedFingerprintRow>(
      client,
      "iac_scan_findings",
      findingRows,
      IAC_SCAN_FINDING_ON_CONFLICT,
      "id, fingerprint",
      "iac_scan_findings_write_failed",
    );

    const findingsByFingerprint = toFingerprintMap(findingRows);
    iacScanFindings.forEach((persistedFinding) => {
      const findingRow = findingsByFingerprint.get(
        persistedFinding.fingerprint,
      );

      evidenceLinks.push(
        buildEvidenceLinkWriteRow({
          deploymentRunId: input.deploymentRunId,
          label: "reported_by",
          metadata: {
            checkId: findingRow?.check_id ?? null,
            evidenceRefs: findingRow?.evidence_refs ?? [],
            parserVersion: CHECKOV_PARSER_VERSION,
            sourcePath: sourceEvidence.path,
          },
          organizationId: input.organizationId,
          sourceId: sourceEvidence.id,
          sourceTable: "raw_evidence_files",
          targetId: persistedFinding.id,
          targetTable: "iac_scan_findings",
        }),
      );
    });
  }

  const persistedEvidenceLinks = await upsertMany<PersistedEvidenceLinkRow>(
    client,
    "evidence_links",
    evidenceLinks,
    EVIDENCE_LINK_ON_CONFLICT,
    "id, label, source_table, target_table",
    "evidence_links_write_failed",
  );

  return {
    ...(terraformPlan ? { terraformPlan } : {}),
    evidenceLinks: persistedEvidenceLinks,
    iacScanFindings,
  };
};

const resolveRawEvidenceFile = async (
  client: ParserPersistenceSupabaseClient,
  input: {
    organizationId: string;
    deploymentRunId: string;
    kind: RawEvidenceFileReadRow["kind"];
    format: RawEvidenceFileReadRow["format"];
    path: string;
  },
): Promise<ParserSourceEvidence> => {
  const result = await asQueryBuilder(client.from("raw_evidence_files"))
    .select(
      "id, organization_id, deployment_run_id, kind, format, path, content_sha256",
    )
    .eq("organization_id", input.organizationId)
    .eq("deployment_run_id", input.deploymentRunId)
    .eq("kind", input.kind)
    .eq("format", input.format)
    .eq("path", input.path)
    .single<RawEvidenceFileReadRow>();

  if (result.error || !result.data) {
    throw new ParsedFixtureEvidencePersistenceError(
      "source_evidence_not_found",
      `Raw evidence file not found for ${input.kind}: ${input.path}`,
      result.error,
    );
  }

  return {
    contentSha256: result.data.content_sha256,
    id: result.data.id,
    path: result.data.path,
  };
};

const upsertSingle = async <T>(
  client: ParserPersistenceSupabaseClient,
  table: string,
  row: unknown,
  onConflict: string,
  selectColumns: string,
  errorCode: string,
): Promise<T> => {
  const result = await asQueryBuilder(client.from(table))
    .upsert(row, { onConflict })
    .select(selectColumns)
    .single<T>();

  if (result.error || !result.data) {
    throw new ParsedFixtureEvidencePersistenceError(
      errorCode,
      `Failed to upsert ${table}.`,
      result.error,
    );
  }

  return result.data;
};

const upsertMany = async <T>(
  client: ParserPersistenceSupabaseClient,
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
    throw new ParsedFixtureEvidencePersistenceError(
      errorCode,
      `Failed to upsert ${table}.`,
      result.error,
    );
  }

  return result.data;
};

const toFingerprintMap = <
  T extends TerraformResourceChangeWriteRow | IacScanFindingWriteRow,
>(
  rows: T[],
): Map<string, T> => new Map(rows.map((row) => [row.fingerprint, row]));

const asQueryBuilder = (value: unknown): QueryBuilderLike => {
  if (!isQueryBuilderLike(value)) {
    throw new ParsedFixtureEvidencePersistenceError(
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
