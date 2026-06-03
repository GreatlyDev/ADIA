import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  isSafeFixturePath,
  validateIngestionEnvelope,
  type IngestionEnvelope,
} from "@adia/core";
import {
  createSupabaseServerClient,
  ingestFixtureEnvelope,
  type EvidenceFileMetadata,
} from "@adia/ingestion";

const DEFAULT_FIXTURE = "github-actions/deploy-staging.json";
const fixtureRoot = resolve(process.cwd(), "scripts", "fixtures");

const main = async (): Promise<void> => {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const envelopePath = resolveFixtureArgument(process.argv[2]);
  const envelope = readAndValidateEnvelope(envelopePath);
  const evidenceFileMetadata = readEvidenceFileMetadata(envelope);
  const supabase = createSupabaseServerClient();
  const result = await ingestFixtureEnvelope(supabase, envelope, {
    evidenceFileMetadata,
  });

  console.log("ADIA Supabase fixture ingestion complete");
  console.log(`Deployment run: ${result.deploymentRun.id}`);
  console.log(`Organization: ${envelope.organizationSlug}`);
  console.log(`Project: ${envelope.projectSlug}`);
  console.log(`Run: ${result.deploymentRun.name}`);
  console.log("Raw evidence metadata:");

  for (const evidence of result.rawEvidenceFiles) {
    console.log(`- ${evidence.kind}: ${evidence.path}`);
  }
};

const printHelp = (): void => {
  console.log(`Usage: pnpm exec tsx scripts/ingest-fixture-to-supabase.ts [fixture-path]

Validates one ADIA fixture envelope, computes raw evidence file metadata,
and writes deployment_runs plus raw_evidence_files rows to Supabase.

Arguments:
  fixture-path  Path relative to scripts/fixtures.
                Defaults to ${DEFAULT_FIXTURE}.

Required environment:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Alternative RLS-authenticated environment:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_INGESTION_ACCESS_TOKEN

This script does not parse Terraform, parse Checkov, call LLMs, or execute infrastructure commands.`);
};

const resolveFixtureArgument = (fixtureArgument?: string): string => {
  const fixturePath = fixtureArgument ?? DEFAULT_FIXTURE;

  if (!isSafeFixturePath(fixturePath)) {
    throw new Error(`Unsafe fixture path: ${fixturePath}`);
  }

  const absolutePath = resolve(fixtureRoot, fixturePath);

  if (!isPathInside(fixtureRoot, absolutePath)) {
    throw new Error(`Fixture path escaped fixture root: ${fixturePath}`);
  }

  return absolutePath;
};

const readAndValidateEnvelope = (fixturePath: string): IngestionEnvelope => {
  if (!existsSync(fixturePath)) {
    throw new Error(`Fixture file does not exist: ${toWorkspacePath(fixturePath)}`);
  }

  const parsed = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
  const validation = validateIngestionEnvelope(parsed);

  if (!validation.ok) {
    throw new Error(
      [
        "Ingestion fixture failed contract validation:",
        ...validation.issues.map(
          (issue) => `- ${issue.path}: ${issue.message}`,
        ),
      ].join("\n"),
    );
  }

  return validation.value;
};

const readEvidenceFileMetadata = (
  envelope: IngestionEnvelope,
): Record<string, EvidenceFileMetadata> =>
  Object.fromEntries(
    envelope.evidence.map((evidence) => {
      const evidencePath = resolveFixtureArgument(evidence.path);

      if (!existsSync(evidencePath)) {
        throw new Error(`Evidence file does not exist: ${evidence.path}`);
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

const isPathInside = (parentPath: string, childPath: string): boolean => {
  const childRelativePath = relative(parentPath, childPath);

  return (
    childRelativePath.length === 0 ||
    (!childRelativePath.startsWith("..") && !isAbsolute(childRelativePath))
  );
};

const toWorkspacePath = (path: string): string =>
  relative(process.cwd(), path).split(sep).join("/");

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`ADIA Supabase fixture ingestion failed\n${message}`);
  process.exitCode = 1;
});
