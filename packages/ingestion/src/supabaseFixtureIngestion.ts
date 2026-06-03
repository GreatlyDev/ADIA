import {
  validateIngestionEnvelope,
  type IngestionEnvelope,
  type IngestionValidationIssue,
} from "@adia/core";

export interface EvidenceFileMetadata {
  sizeBytes?: number;
  contentSha256?: string;
}

export interface DeploymentRunWriteScope {
  organizationId: string;
  projectId: string;
}

export interface RawEvidenceFileWriteScope {
  organizationId: string;
  deploymentRunId: string;
  evidenceFileMetadata?: Record<string, EvidenceFileMetadata>;
}

export interface DeploymentRunWriteRow {
  organization_id: string;
  project_id: string;
  name: string;
  status: IngestionEnvelope["run"]["status"];
  environment: string;
  source: IngestionEnvelope["source"];
  commit_sha: string | null;
  branch: string | null;
  external_run_id: string | null;
  external_run_url: string | null;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown>;
}

export interface RawEvidenceFileWriteRow {
  organization_id: string;
  deployment_run_id: string;
  kind: IngestionEnvelope["evidence"][number]["kind"];
  format: IngestionEnvelope["evidence"][number]["format"];
  path: string;
  label: string | null;
  size_bytes: number | null;
  content_sha256: string | null;
  metadata: Record<string, unknown>;
}

export interface SupabaseFixtureIngestionResult {
  deploymentRun: {
    id: string;
    organization_id: string;
    project_id: string;
    name: string;
  };
  rawEvidenceFiles: Array<{
    id: string;
    path: string;
    kind: RawEvidenceFileWriteRow["kind"];
    format: RawEvidenceFileWriteRow["format"];
  }>;
}

export interface SupabaseFixtureIngestionOptions {
  evidenceFileMetadata?: Record<string, EvidenceFileMetadata>;
}

export interface SupabaseIngestionClient {
  from(table: string): unknown;
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

export class SupabaseFixtureIngestionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "SupabaseFixtureIngestionError";
  }
}

export const buildDeploymentRunWrite = (
  envelope: IngestionEnvelope,
  scope: DeploymentRunWriteScope,
): DeploymentRunWriteRow => ({
  organization_id: scope.organizationId,
  project_id: scope.projectId,
  name: envelope.run.name,
  status: envelope.run.status,
  environment: envelope.run.environment,
  source: envelope.source,
  commit_sha: envelope.run.commitSha ?? null,
  branch: envelope.run.branch ?? null,
  external_run_id: envelope.run.externalId ?? null,
  external_run_url: envelope.run.url ?? null,
  started_at: envelope.run.startedAt,
  completed_at: envelope.run.completedAt ?? null,
  duration_seconds: calculateDurationSeconds(
    envelope.run.startedAt,
    envelope.run.completedAt,
  ),
  metadata: {
    envelope: envelope.metadata ?? {},
    ingestion: {
      actor: envelope.run.actor ?? null,
      evidenceCount: envelope.evidence.length,
      schemaVersion: envelope.schemaVersion,
      source: envelope.source,
    },
    run: envelope.run.metadata ?? {},
  },
});

export const buildRawEvidenceFileRows = (
  envelope: IngestionEnvelope,
  scope: RawEvidenceFileWriteScope,
): RawEvidenceFileWriteRow[] =>
  envelope.evidence.map((evidence) => {
    const fileMetadata = scope.evidenceFileMetadata?.[evidence.path];

    return {
      organization_id: scope.organizationId,
      deployment_run_id: scope.deploymentRunId,
      kind: evidence.kind,
      format: evidence.format,
      path: evidence.path,
      label: evidence.label ?? null,
      size_bytes: fileMetadata?.sizeBytes ?? null,
      content_sha256: fileMetadata?.contentSha256 ?? null,
      metadata: {
        evidence: evidence.metadata ?? {},
        ingestion: {
          schemaVersion: envelope.schemaVersion,
          source: envelope.source,
        },
      },
    };
  });

export const ingestFixtureEnvelope = async (
  client: SupabaseIngestionClient,
  input: unknown,
  options: SupabaseFixtureIngestionOptions = {},
): Promise<SupabaseFixtureIngestionResult> => {
  const validation = validateIngestionEnvelope(input);

  if (!validation.ok) {
    throw new SupabaseFixtureIngestionError(
      "invalid_envelope",
      formatValidationIssues(validation.issues),
      validation.issues,
    );
  }

  const envelope = validation.value;
  const organization = await resolveOrganization(client, envelope);
  const project = await resolveProject(client, envelope, organization.id);
  const deploymentRun = await upsertDeploymentRun(client, envelope, {
    organizationId: organization.id,
    projectId: project.id,
  });
  const rawEvidenceFiles = await upsertRawEvidenceFiles(client, envelope, {
    deploymentRunId: deploymentRun.id,
    evidenceFileMetadata: options.evidenceFileMetadata,
    organizationId: organization.id,
  });

  return {
    deploymentRun,
    rawEvidenceFiles,
  };
};

const resolveOrganization = async (
  client: SupabaseIngestionClient,
  envelope: IngestionEnvelope,
): Promise<{ id: string; slug: string }> => {
  const result = await asQueryBuilder(client.from("organizations"))
    .select("id, slug")
    .eq("slug", envelope.organizationSlug)
    .single<{ id: string; slug: string }>();

  if (result.error || !result.data) {
    throw new SupabaseFixtureIngestionError(
      "organization_not_found",
      `Organization slug not found: ${envelope.organizationSlug}`,
      result.error,
    );
  }

  return result.data;
};

const resolveProject = async (
  client: SupabaseIngestionClient,
  envelope: IngestionEnvelope,
  organizationId: string,
): Promise<{ id: string; slug: string; organization_id: string }> => {
  const result = await asQueryBuilder(client.from("projects"))
    .select("id, slug, organization_id")
    .eq("organization_id", organizationId)
    .eq("slug", envelope.projectSlug)
    .single<{ id: string; slug: string; organization_id: string }>();

  if (result.error || !result.data) {
    throw new SupabaseFixtureIngestionError(
      "project_not_found",
      `Project slug not found in organization ${envelope.organizationSlug}: ${envelope.projectSlug}`,
      result.error,
    );
  }

  return result.data;
};

const upsertDeploymentRun = async (
  client: SupabaseIngestionClient,
  envelope: IngestionEnvelope,
  scope: DeploymentRunWriteScope,
): Promise<SupabaseFixtureIngestionResult["deploymentRun"]> => {
  const result = await asQueryBuilder(client.from("deployment_runs"))
    .upsert(buildDeploymentRunWrite(envelope, scope), {
      onConflict: "organization_id,project_id,source,external_run_id",
    })
    .select("id, organization_id, project_id, name")
    .single<SupabaseFixtureIngestionResult["deploymentRun"]>();

  if (result.error || !result.data) {
    throw new SupabaseFixtureIngestionError(
      "deployment_run_write_failed",
      "Failed to write deployment run.",
      result.error,
    );
  }

  return result.data;
};

const upsertRawEvidenceFiles = async (
  client: SupabaseIngestionClient,
  envelope: IngestionEnvelope,
  scope: RawEvidenceFileWriteScope,
): Promise<SupabaseFixtureIngestionResult["rawEvidenceFiles"]> => {
  const rows = buildRawEvidenceFileRows(envelope, scope);
  const result = (await asQueryBuilder(client.from("raw_evidence_files"))
    .upsert(rows, {
      onConflict: "deployment_run_id,path",
    })
    .select("id, path, kind, format")) as QueryResult<
    SupabaseFixtureIngestionResult["rawEvidenceFiles"]
  >;

  if (result.error || !result.data) {
    throw new SupabaseFixtureIngestionError(
      "raw_evidence_write_failed",
      "Failed to write raw evidence metadata.",
      result.error,
    );
  }

  return result.data;
};

const calculateDurationSeconds = (
  startedAt: string,
  completedAt?: string,
): number | null => {
  if (!completedAt) {
    return null;
  }

  return Math.floor(
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000,
  );
};

const formatValidationIssues = (issues: IngestionValidationIssue[]): string =>
  [
    "Ingestion envelope failed validation:",
    ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
  ].join("\n");

const asQueryBuilder = (value: unknown): QueryBuilderLike => {
  if (!isQueryBuilderLike(value)) {
    throw new SupabaseFixtureIngestionError(
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
