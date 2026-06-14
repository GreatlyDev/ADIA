import { createHash } from "node:crypto";

import type { Anomaly, EvidenceTable } from "@adia/core";

import {
  buildEvidenceLinkWriteRow,
  type EvidenceLinkWriteRow,
} from "./parserPersistence";

export const ANOMALY_ENGINE_VERSION = "anomaly-engine-v1";
export const ANOMALY_ON_CONFLICT =
  "deployment_run_id,anomaly_engine_version,fingerprint";
export const ANOMALY_EVIDENCE_LINK_LABEL = "supports_anomaly";

export const ANOMALY_EVIDENCE_TABLES = [
  "deployment_runs",
  "terraform_plans",
  "terraform_resource_changes",
  "iac_scan_findings",
] as const satisfies readonly EvidenceTable[];

export type AnomalyEvidenceTable = (typeof ANOMALY_EVIDENCE_TABLES)[number];

export interface AnomalyPersistenceScope {
  organizationId: string;
  deploymentRunId: string;
  anomalyEngineVersion?: string;
}

export interface ParsedAnomalyEvidenceRef {
  evidenceRef: string;
  sourceTable: AnomalyEvidenceTable;
  sourceId: string;
}

export interface AnomalyWriteRow {
  organization_id: string;
  deployment_run_id: string;
  anomaly_engine_version: string;
  fingerprint: string;
  severity: Anomaly["severity"];
  category: string | null;
  title: string;
  summary: string;
  evidence_refs: string[];
  detected_at: string;
  metadata: Record<string, unknown>;
}

export interface PersistedAnomalyReference {
  fingerprint: string;
  id: string;
}

export class AnomalyPersistenceMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnomalyPersistenceMappingError";
  }
}

export const parseAnomalyEvidenceRef = (
  evidenceRef: string,
): ParsedAnomalyEvidenceRef => {
  const parts = evidenceRef.split(":");

  if (parts.length !== 2) {
    throw new AnomalyPersistenceMappingError(
      `Anomaly evidence ref must use table:id format: ${evidenceRef}`,
    );
  }

  const [sourceTable, sourceId] = parts;

  if (!isAnomalyEvidenceTable(sourceTable)) {
    throw new AnomalyPersistenceMappingError(
      `Unsupported anomaly evidence table: ${sourceTable}`,
    );
  }

  if (!sourceId || sourceId.trim() !== sourceId) {
    throw new AnomalyPersistenceMappingError(
      `Anomaly evidence ref source id is invalid: ${evidenceRef}`,
    );
  }

  return {
    evidenceRef,
    sourceTable,
    sourceId,
  };
};

export const buildAnomalyWriteRows = (
  anomalies: Anomaly[],
  scope: AnomalyPersistenceScope,
): AnomalyWriteRow[] => {
  const anomalyEngineVersion =
    scope.anomalyEngineVersion ?? ANOMALY_ENGINE_VERSION;

  return anomalies.map((anomaly) => {
    assertScope(
      anomaly.organizationId,
      anomaly.deploymentRunId,
      scope.organizationId,
      scope.deploymentRunId,
      "Anomaly does not match the persistence scope.",
    );

    const evidenceRefs = normalizeEvidenceRefs(anomaly.evidenceRefs);

    return {
      organization_id: scope.organizationId,
      deployment_run_id: scope.deploymentRunId,
      anomaly_engine_version: anomalyEngineVersion,
      fingerprint: fingerprintFor("anomaly", {
        anomalyEngineVersion,
        category: anomaly.category ?? null,
        deploymentRunId: scope.deploymentRunId,
        evidenceRefs,
        severity: anomaly.severity,
        title: anomaly.title,
      }),
      severity: anomaly.severity,
      category: anomaly.category ?? null,
      title: anomaly.title,
      summary: anomaly.summary,
      evidence_refs: evidenceRefs,
      detected_at: anomaly.detectedAt,
      metadata: {
        anomalyEngineVersion,
        anomalyId: anomaly.id,
        evidenceRefCount: evidenceRefs.length,
      },
    };
  });
};

export const buildAnomalyEvidenceLinkRows = (
  anomalies: Anomaly[],
  persistedAnomalies: PersistedAnomalyReference[],
  scope: AnomalyPersistenceScope,
): EvidenceLinkWriteRow[] => {
  const anomalyRows = buildAnomalyWriteRows(anomalies, scope);
  const persistedIdByFingerprint = new Map(
    persistedAnomalies.map((anomaly) => [anomaly.fingerprint, anomaly.id]),
  );
  const rows: EvidenceLinkWriteRow[] = [];
  const seen = new Set<string>();

  for (const anomalyRow of anomalyRows) {
    const targetId = persistedIdByFingerprint.get(anomalyRow.fingerprint);

    if (!targetId) {
      throw new AnomalyPersistenceMappingError(
        `Persisted anomaly id is missing for fingerprint ${anomalyRow.fingerprint}.`,
      );
    }

    for (const evidenceRef of anomalyRow.evidence_refs) {
      const parsed = parseAnomalyEvidenceRef(evidenceRef);
      const row = buildEvidenceLinkWriteRow({
        deploymentRunId: scope.deploymentRunId,
        label: ANOMALY_EVIDENCE_LINK_LABEL,
        metadata: {
          anomalyCategory: anomalyRow.category,
          anomalyEngineVersion: anomalyRow.anomaly_engine_version,
          evidenceRef,
        },
        organizationId: scope.organizationId,
        sourceId: parsed.sourceId,
        sourceTable: parsed.sourceTable,
        targetId,
        targetTable: "anomalies",
      });
      const key = [
        row.organization_id,
        row.source_table,
        row.source_id,
        row.target_table,
        row.target_id,
        row.label,
      ].join(":");

      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
      }
    }
  }

  return rows;
};

const isAnomalyEvidenceTable = (
  tableName: string,
): tableName is AnomalyEvidenceTable =>
  ANOMALY_EVIDENCE_TABLES.some((table) => table === tableName);

const normalizeEvidenceRefs = (evidenceRefs: string[]): string[] => {
  const normalized = [...new Set(evidenceRefs)].sort();

  if (normalized.length === 0) {
    throw new AnomalyPersistenceMappingError(
      "At least one evidence ref is required to persist an anomaly.",
    );
  }

  for (const evidenceRef of normalized) {
    parseAnomalyEvidenceRef(evidenceRef);
  }

  return normalized;
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
    throw new AnomalyPersistenceMappingError(message);
  }
};

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
