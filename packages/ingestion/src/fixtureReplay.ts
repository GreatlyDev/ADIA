import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { parseIacScanFindings, summarizeTerraformPlan } from "@adia/analyzers";
import {
  isSafeFixturePath,
  validateIngestionEnvelope,
  type IngestionEnvelope,
} from "@adia/core";

import {
  persistParsedFixtureEvidence,
  type ParserPersistenceSupabaseClient,
} from "./fixtureParserPersistence";
import {
  persistFixtureAnomalies,
  type AnomalyPersistenceSupabaseClient,
} from "./fixtureAnomalyPersistence";
import {
  ingestFixtureEnvelope,
  type EvidenceFileMetadata,
  type SupabaseIngestionClient,
} from "./supabaseFixtureIngestion";

export const DEFAULT_REPLAY_FIXTURE = "github-actions/deploy-staging.json";

export interface ReplayParsedFixtureOptions {
  fixturePath?: string;
  fixtureRoot?: string;
  cwd?: string;
}

export interface ReplayParsedFixtureResult {
  organizationId: string;
  deploymentRunId: string;
  rawEvidenceFileCount: number;
  terraformPlanId?: string;
  terraformResourceChangeCount: number;
  checkovFindingCount: number;
  anomalyCount: number;
  parserEvidenceLinkCount: number;
  anomalyEvidenceLinkCount: number;
  evidenceLinkCount: number;
}

export type FixtureReplayClient = SupabaseIngestionClient &
  ParserPersistenceSupabaseClient &
  AnomalyPersistenceSupabaseClient;

export class FixtureReplayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "FixtureReplayError";
  }
}

export const replayParsedFixture = async (
  client: FixtureReplayClient,
  options: ReplayParsedFixtureOptions = {},
): Promise<ReplayParsedFixtureResult> => {
  const fixtureRoot = resolveFixtureRoot(options);
  const envelopePath = resolveFixturePath(
    fixtureRoot,
    options.fixturePath ?? DEFAULT_REPLAY_FIXTURE,
  );
  const envelope = readAndValidateEnvelope(envelopePath);
  const evidenceFileMetadata = readEvidenceFileMetadata(fixtureRoot, envelope);
  const ingestionResult = await ingestFixtureEnvelope(client, envelope, {
    evidenceFileMetadata,
  });
  const organizationId = ingestionResult.deploymentRun.organization_id;
  const deploymentRunId = ingestionResult.deploymentRun.id;
  const terraformEvidence = requireEvidence(envelope, {
    format: "terraform_show_json",
    kind: "terraform_plan",
  });
  const checkovEvidence = requireEvidence(envelope, {
    format: "checkov_json",
    kind: "iac_scan",
  });
  const terraformPlanJson = readJsonFixture(
    resolveFixturePath(fixtureRoot, terraformEvidence.path),
  );
  const checkovScanJson = readJsonFixture(
    resolveFixturePath(fixtureRoot, checkovEvidence.path),
  );
  const terraformSummary = summarizeTerraformPlan({
    deploymentRunId,
    organizationId,
    plan: terraformPlanJson,
  });
  const checkovFindings = parseIacScanFindings({
    deploymentRunId,
    organizationId,
    scan: checkovScanJson,
    scanner: "checkov",
  });
  const parserPersistenceResult = await persistParsedFixtureEvidence(client, {
    checkov: {
      findings: checkovFindings,
      sourceEvidencePath: checkovEvidence.path,
    },
    deploymentRunId,
    organizationId,
    terraform: {
      sourceEvidencePath: terraformEvidence.path,
      summary: terraformSummary,
    },
  });
  const anomalyPersistenceResult = await persistFixtureAnomalies(client, {
    deploymentRunId,
    organizationId,
  });
  const parserEvidenceLinkCount = parserPersistenceResult.evidenceLinks.length;
  const anomalyEvidenceLinkCount =
    anomalyPersistenceResult.evidenceLinks.length;

  return {
    anomalyCount: anomalyPersistenceResult.anomalies.length,
    anomalyEvidenceLinkCount,
    checkovFindingCount: parserPersistenceResult.iacScanFindings.length,
    deploymentRunId,
    evidenceLinkCount: parserEvidenceLinkCount + anomalyEvidenceLinkCount,
    organizationId,
    parserEvidenceLinkCount,
    rawEvidenceFileCount: ingestionResult.rawEvidenceFiles.length,
    terraformPlanId: parserPersistenceResult.terraformPlan?.id,
    terraformResourceChangeCount:
      parserPersistenceResult.terraformPlan?.resourceChanges.length ?? 0,
  };
};

const resolveFixtureRoot = (options: ReplayParsedFixtureOptions): string =>
  resolve(
    options.fixtureRoot ??
      resolve(options.cwd ?? process.cwd(), "scripts", "fixtures"),
  );

const resolveFixturePath = (
  fixtureRoot: string,
  fixturePath: string,
): string => {
  if (!isSafeFixturePath(fixturePath)) {
    throw new FixtureReplayError(
      "unsafe_fixture_path",
      `Unsafe fixture path: ${fixturePath}`,
    );
  }

  const absolutePath = resolve(fixtureRoot, fixturePath);

  if (!isPathInside(fixtureRoot, absolutePath)) {
    throw new FixtureReplayError(
      "fixture_path_escape",
      `Fixture path escaped fixture root: ${fixturePath}`,
    );
  }

  return absolutePath;
};

const readAndValidateEnvelope = (fixturePath: string): IngestionEnvelope => {
  const parsed = readJsonFixture(fixturePath);
  const validation = validateIngestionEnvelope(parsed);

  if (!validation.ok) {
    throw new FixtureReplayError(
      "invalid_envelope",
      [
        "Ingestion fixture failed contract validation:",
        ...validation.issues.map(
          (issue) => `- ${issue.path}: ${issue.message}`,
        ),
      ].join("\n"),
      validation.issues,
    );
  }

  return validation.value;
};

const readJsonFixture = (fixturePath: string): unknown => {
  if (!existsSync(fixturePath)) {
    throw new FixtureReplayError(
      "fixture_not_found",
      `Fixture file does not exist: ${toWorkspacePath(fixturePath)}`,
    );
  }

  try {
    return JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
  } catch (error) {
    throw new FixtureReplayError(
      "invalid_json_fixture",
      `Fixture file is not valid JSON: ${toWorkspacePath(fixturePath)}`,
      error,
    );
  }
};

const readEvidenceFileMetadata = (
  fixtureRoot: string,
  envelope: IngestionEnvelope,
): Record<string, EvidenceFileMetadata> =>
  Object.fromEntries(
    envelope.evidence.map((evidence) => {
      const evidencePath = resolveFixturePath(fixtureRoot, evidence.path);

      if (!existsSync(evidencePath)) {
        throw new FixtureReplayError(
          "evidence_not_found",
          `Evidence file does not exist: ${evidence.path}`,
        );
      }

      const file = readFileSync(evidencePath);
      const stats = statSync(evidencePath);

      return [
        evidence.path,
        {
          contentSha256: createHash("sha256").update(file).digest("hex"),
          sizeBytes: stats.size,
        },
      ];
    }),
  );

const requireEvidence = (
  envelope: IngestionEnvelope,
  expected: {
    kind: IngestionEnvelope["evidence"][number]["kind"];
    format: IngestionEnvelope["evidence"][number]["format"];
  },
): IngestionEnvelope["evidence"][number] => {
  const evidence = envelope.evidence.find(
    (candidate) =>
      candidate.kind === expected.kind && candidate.format === expected.format,
  );

  if (!evidence) {
    throw new FixtureReplayError(
      "required_evidence_missing",
      `Envelope is missing ${expected.kind} evidence in ${expected.format} format.`,
    );
  }

  return evidence;
};

const isPathInside = (parentPath: string, childPath: string): boolean => {
  const childRelativePath = relative(parentPath, childPath);

  return (
    childRelativePath.length === 0 ||
    (!childRelativePath.startsWith("..") && !isAbsolute(childRelativePath))
  );
};

const toWorkspacePath = (path: string): string =>
  relative(process.cwd(), path).split(sep).join("/");
