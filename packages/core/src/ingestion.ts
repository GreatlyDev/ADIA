export const INGESTION_SCHEMA_VERSION = "adia.ingestion.v1" as const;

export const INGESTION_SOURCES = [
  "github_actions",
  "manual",
  "fixture",
] as const;

export const INGESTION_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;

export const INGESTION_EVIDENCE_KINDS = [
  "terraform_plan",
  "iac_scan",
  "log",
] as const;

export const INGESTION_EVIDENCE_FORMATS = [
  "terraform_show_json",
  "checkov_json",
  "plain_text",
] as const;

export type IngestionSchemaVersion = typeof INGESTION_SCHEMA_VERSION;
export type IngestionSource = (typeof INGESTION_SOURCES)[number];
export type IngestionRunStatus = (typeof INGESTION_STATUSES)[number];
export type IngestionEvidenceKind = (typeof INGESTION_EVIDENCE_KINDS)[number];
export type IngestionEvidenceFormat =
  (typeof INGESTION_EVIDENCE_FORMATS)[number];

export interface IngestionEvidenceRef {
  kind: IngestionEvidenceKind;
  format: IngestionEvidenceFormat;
  path: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestionRunRef {
  name: string;
  status: IngestionRunStatus;
  environment: string;
  startedAt: string;
  externalId?: string;
  completedAt?: string;
  commitSha?: string;
  branch?: string;
  actor?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestionEnvelope {
  schemaVersion: IngestionSchemaVersion;
  source: IngestionSource;
  organizationSlug: string;
  projectSlug: string;
  run: IngestionRunRef;
  evidence: IngestionEvidenceRef[];
  metadata?: Record<string, unknown>;
}

export interface IngestionValidationIssue {
  path: string;
  message: string;
}

export type IngestionValidationResult =
  | {
      ok: true;
      value: IngestionEnvelope;
      issues: [];
    }
  | {
      ok: false;
      issues: IngestionValidationIssue[];
    };

export interface IngestionEnvelopeSummary {
  organizationSlug: string;
  projectSlug: string;
  runName: string;
  status: IngestionRunStatus;
  evidence: string[];
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const evidenceKindLabels: Record<IngestionEvidenceKind, string> = {
  terraform_plan: "Terraform plan",
  iac_scan: "IaC scan",
  log: "Log",
};

export const isSafeFixturePath = (fixturePath: string): boolean => {
  if (typeof fixturePath !== "string") {
    return false;
  }

  if (fixturePath.length === 0 || fixturePath.trim() !== fixturePath) {
    return false;
  }

  if (
    fixturePath.startsWith("/") ||
    fixturePath.startsWith("\\") ||
    /^[A-Za-z]:/.test(fixturePath) ||
    fixturePath.includes("\\") ||
    fixturePath.includes("//") ||
    fixturePath.includes("://")
  ) {
    return false;
  }

  const parts = fixturePath.split("/");

  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
};

export const validateIngestionEnvelope = (
  input: unknown,
): IngestionValidationResult => {
  const issues: IngestionValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          path: "root",
          message: "Expected an ingestion envelope object.",
        },
      ],
    };
  }

  if (input.schemaVersion !== INGESTION_SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      message: `Expected schema version ${INGESTION_SCHEMA_VERSION}.`,
    });
  }

  if (!isOneOf(input.source, INGESTION_SOURCES)) {
    issues.push({
      path: "source",
      message: "Expected one of github_actions, manual, fixture.",
    });
  }

  validateSlug(input.organizationSlug, "organizationSlug", issues);
  validateSlug(input.projectSlug, "projectSlug", issues);
  validateRun(input.run, issues);
  validateEvidence(input.evidence, issues);
  validateOptionalRecord(input.metadata, "metadata", issues);

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    value: input as unknown as IngestionEnvelope,
    issues: [],
  };
};

export const summarizeIngestionEnvelope = (
  envelope: IngestionEnvelope,
): IngestionEnvelopeSummary => ({
  organizationSlug: envelope.organizationSlug,
  projectSlug: envelope.projectSlug,
  runName: envelope.run.name,
  status: envelope.run.status,
  evidence: envelope.evidence.map(
    (evidence) => `${evidenceKindLabels[evidence.kind]}: ${evidence.path}`,
  ),
});

const validateRun = (
  input: unknown,
  issues: IngestionValidationIssue[],
): void => {
  if (!isRecord(input)) {
    issues.push({
      path: "run",
      message: "Expected a deployment run object.",
    });
    return;
  }

  validateRequiredString(input.name, "run.name", issues);
  validateRequiredString(input.environment, "run.environment", issues);
  validateOptionalString(input.externalId, "run.externalId", issues);
  validateOptionalString(input.commitSha, "run.commitSha", issues);
  validateOptionalString(input.branch, "run.branch", issues);
  validateOptionalString(input.actor, "run.actor", issues);
  validateOptionalString(input.url, "run.url", issues);
  validateOptionalRecord(input.metadata, "run.metadata", issues);

  if (!isOneOf(input.status, INGESTION_STATUSES)) {
    issues.push({
      path: "run.status",
      message: "Expected one of queued, running, succeeded, failed, canceled.",
    });
  }

  validateTimestamp(input.startedAt, "run.startedAt", issues);

  if (input.completedAt !== undefined) {
    validateTimestamp(input.completedAt, "run.completedAt", issues);
  }

  if (
    isValidDateString(input.startedAt) &&
    isValidDateString(input.completedAt) &&
    new Date(input.completedAt).getTime() < new Date(input.startedAt).getTime()
  ) {
    issues.push({
      path: "run.completedAt",
      message: "Expected completedAt to be after startedAt.",
    });
  }
};

const validateEvidence = (
  input: unknown,
  issues: IngestionValidationIssue[],
): void => {
  if (!Array.isArray(input)) {
    issues.push({
      path: "evidence",
      message: "Expected an evidence array.",
    });
    return;
  }

  if (input.length === 0) {
    issues.push({
      path: "evidence",
      message: "Expected at least one evidence item.",
    });
    return;
  }

  input.forEach((item, index) => {
    const pathPrefix = `evidence[${index}]`;

    if (!isRecord(item)) {
      issues.push({
        path: pathPrefix,
        message: "Expected an evidence object.",
      });
      return;
    }

    if (!isOneOf(item.kind, INGESTION_EVIDENCE_KINDS)) {
      issues.push({
        path: `${pathPrefix}.kind`,
        message: "Expected one of terraform_plan, iac_scan, log.",
      });
    }

    if (!isOneOf(item.format, INGESTION_EVIDENCE_FORMATS)) {
      issues.push({
        path: `${pathPrefix}.format`,
        message: "Expected one of terraform_show_json, checkov_json, plain_text.",
      });
    }

    if (typeof item.path !== "string" || !isSafeFixturePath(item.path)) {
      issues.push({
        path: `${pathPrefix}.path`,
        message: "Expected a safe relative fixture path.",
      });
    }

    validateOptionalString(item.label, `${pathPrefix}.label`, issues);
    validateOptionalRecord(item.metadata, `${pathPrefix}.metadata`, issues);
  });
};

const validateSlug = (
  input: unknown,
  path: string,
  issues: IngestionValidationIssue[],
): void => {
  if (typeof input !== "string" || !SLUG_PATTERN.test(input)) {
    issues.push({
      path,
      message: "Expected a lowercase slug with letters, numbers, and hyphens.",
    });
  }
};

const validateRequiredString = (
  input: unknown,
  path: string,
  issues: IngestionValidationIssue[],
): void => {
  if (typeof input !== "string" || input.trim().length === 0) {
    issues.push({
      path,
      message: "Expected a non-empty string.",
    });
  }
};

const validateOptionalString = (
  input: unknown,
  path: string,
  issues: IngestionValidationIssue[],
): void => {
  if (input !== undefined && typeof input !== "string") {
    issues.push({
      path,
      message: "Expected a string when provided.",
    });
  }
};

const validateTimestamp = (
  input: unknown,
  path: string,
  issues: IngestionValidationIssue[],
): void => {
  if (!isValidDateString(input)) {
    issues.push({
      path,
      message: "Expected an ISO timestamp.",
    });
  }
};

const validateOptionalRecord = (
  input: unknown,
  path: string,
  issues: IngestionValidationIssue[],
): void => {
  if (input !== undefined && !isRecord(input)) {
    issues.push({
      path,
      message: "Expected an object when provided.",
    });
  }
};

const isValidDateString = (input: unknown): input is string =>
  typeof input === "string" &&
  ISO_TIMESTAMP_PATTERN.test(input) &&
  !Number.isNaN(new Date(input).getTime());

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

const isOneOf = <T extends readonly string[]>(
  input: unknown,
  values: T,
): input is T[number] => typeof input === "string" && values.includes(input);
