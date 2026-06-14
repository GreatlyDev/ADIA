import type { Anomaly } from "@adia/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  ANOMALY_EVIDENCE_LINK_LABEL,
  ANOMALY_ENGINE_VERSION,
  ANOMALY_ON_CONFLICT,
  AnomalyPersistenceMappingError,
  buildAnomalyEvidenceLinkRows,
  buildAnomalyWriteRows,
  parseAnomalyEvidenceRef,
} from "../src/anomalyPersistence";

const scope = {
  organizationId: "org-1",
  deploymentRunId: "run-1",
};

const anomaly = (overrides: Partial<Anomaly> = {}): Anomaly => ({
  id: "anomaly-run-1-0",
  organizationId: "org-1",
  deploymentRunId: "run-1",
  severity: "critical",
  category: "terraform_public_exposure",
  title: "Public exposure introduced by Terraform plan",
  summary: "Terraform evidence includes a public exposure signal.",
  evidenceRefs: [
    "terraform_resource_changes:tf-change-1",
    "terraform_plans:tf-plan-1",
    "terraform_resource_changes:tf-change-1",
  ],
  detectedAt: "2026-01-15T13:30:00.000Z",
  ...overrides,
});

describe("parseAnomalyEvidenceRef", () => {
  it.each([
    [
      "deployment_runs:run-1",
      { sourceTable: "deployment_runs", sourceId: "run-1" },
    ],
    [
      "terraform_plans:tf-plan-1",
      { sourceTable: "terraform_plans", sourceId: "tf-plan-1" },
    ],
    [
      "terraform_resource_changes:tf-change-1",
      {
        sourceTable: "terraform_resource_changes",
        sourceId: "tf-change-1",
      },
    ],
    [
      "iac_scan_findings:finding-1",
      { sourceTable: "iac_scan_findings", sourceId: "finding-1" },
    ],
  ] as const)("parses supported evidence ref %s", (evidenceRef, expected) => {
    expect(parseAnomalyEvidenceRef(evidenceRef)).toEqual({
      evidenceRef,
      ...expected,
    });
  });

  it.each([
    "raw_evidence_files:evidence-1",
    "anomalies:anomaly-1",
    "terraform_plans:",
    "terraform_plans",
    "terraform_plans:one:two",
    "terraform_plans: leading-space",
  ])("rejects unsupported or malformed evidence ref %s", (evidenceRef) => {
    expect(() => parseAnomalyEvidenceRef(evidenceRef)).toThrow(
      AnomalyPersistenceMappingError,
    );
  });
});

describe("buildAnomalyWriteRows", () => {
  it("maps anomalies into replay-safe anomaly write rows", () => {
    const rows = buildAnomalyWriteRows([anomaly()], scope);

    expect(ANOMALY_ON_CONFLICT).toBe(
      "deployment_run_id,anomaly_engine_version,fingerprint",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: "org-1",
      deployment_run_id: "run-1",
      anomaly_engine_version: ANOMALY_ENGINE_VERSION,
      severity: "critical",
      category: "terraform_public_exposure",
      title: "Public exposure introduced by Terraform plan",
      summary: "Terraform evidence includes a public exposure signal.",
      evidence_refs: [
        "terraform_plans:tf-plan-1",
        "terraform_resource_changes:tf-change-1",
      ],
      detected_at: "2026-01-15T13:30:00.000Z",
      metadata: {
        anomalyEngineVersion: ANOMALY_ENGINE_VERSION,
        anomalyId: "anomaly-run-1-0",
        evidenceRefCount: 2,
      },
    });
    expect(rows[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps the fingerprint stable across duplicate refs, ref order, summary, and detectedAt changes", () => {
    const [first] = buildAnomalyWriteRows([anomaly()], scope);
    const [second] = buildAnomalyWriteRows(
      [
        anomaly({
          summary: "Updated wording should not fork the logical anomaly.",
          detectedAt: "2026-01-15T14:30:00.000Z",
          evidenceRefs: [
            "terraform_plans:tf-plan-1",
            "terraform_resource_changes:tf-change-1",
            "terraform_plans:tf-plan-1",
          ],
        }),
      ],
      scope,
    );

    expect(second?.fingerprint).toBe(first?.fingerprint);
  });

  it("rejects anomalies from another organization or deployment run", () => {
    expect(() =>
      buildAnomalyWriteRows(
        [anomaly({ organizationId: "org-2", deploymentRunId: "run-1" })],
        scope,
      ),
    ).toThrow(AnomalyPersistenceMappingError);

    expect(() =>
      buildAnomalyWriteRows(
        [anomaly({ organizationId: "org-1", deploymentRunId: "run-2" })],
        scope,
      ),
    ).toThrow(AnomalyPersistenceMappingError);
  });

  it("normalizes generated evidence refs into stable unique refs and fingerprints", () => {
    const evidenceRefArb = fc
      .record({
        sourceTable: fc.constantFrom(
          "deployment_runs",
          "terraform_plans",
          "terraform_resource_changes",
          "iac_scan_findings",
        ),
        sourceId: fc.integer({ min: 1, max: 1_000 }).map((id) => `id-${id}`),
      })
      .map(({ sourceTable, sourceId }) => `${sourceTable}:${sourceId}`);

    fc.assert(
      fc.property(
        fc.array(evidenceRefArb, { minLength: 1, maxLength: 20 }),
        (evidenceRefs) => {
          const withDuplicates = [...evidenceRefs, ...evidenceRefs].reverse();
          const [first] = buildAnomalyWriteRows(
            [anomaly({ evidenceRefs })],
            scope,
          );
          const [second] = buildAnomalyWriteRows(
            [anomaly({ evidenceRefs: withDuplicates })],
            scope,
          );

          expect(first?.evidence_refs).toEqual(
            [...new Set(evidenceRefs)].sort(),
          );
          expect(second?.evidence_refs).toEqual(first?.evidence_refs);
          expect(second?.fingerprint).toBe(first?.fingerprint);
        },
      ),
    );
  });
});

describe("buildAnomalyEvidenceLinkRows", () => {
  it("maps anomaly evidence refs into duplicate-safe evidence link rows", () => {
    const [row] = buildAnomalyWriteRows([anomaly()], scope);
    const links = buildAnomalyEvidenceLinkRows(
      [anomaly()],
      [{ fingerprint: row?.fingerprint ?? "", id: "persisted-anomaly-1" }],
      scope,
    );

    expect(links).toHaveLength(2);
    expect(links).toEqual([
      {
        organization_id: "org-1",
        deployment_run_id: "run-1",
        source_table: "terraform_plans",
        source_id: "tf-plan-1",
        target_table: "anomalies",
        target_id: "persisted-anomaly-1",
        label: ANOMALY_EVIDENCE_LINK_LABEL,
        metadata: {
          anomalyCategory: "terraform_public_exposure",
          anomalyEngineVersion: ANOMALY_ENGINE_VERSION,
          evidenceRef: "terraform_plans:tf-plan-1",
        },
      },
      {
        organization_id: "org-1",
        deployment_run_id: "run-1",
        source_table: "terraform_resource_changes",
        source_id: "tf-change-1",
        target_table: "anomalies",
        target_id: "persisted-anomaly-1",
        label: ANOMALY_EVIDENCE_LINK_LABEL,
        metadata: {
          anomalyCategory: "terraform_public_exposure",
          anomalyEngineVersion: ANOMALY_ENGINE_VERSION,
          evidenceRef: "terraform_resource_changes:tf-change-1",
        },
      },
    ]);
  });

  it("requires persisted anomaly ids before evidence links can be built", () => {
    expect(() => buildAnomalyEvidenceLinkRows([anomaly()], [], scope)).toThrow(
      AnomalyPersistenceMappingError,
    );
  });
});
