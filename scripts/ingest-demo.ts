import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  isSafeFixturePath,
  summarizeIngestionEnvelope,
  validateIngestionEnvelope,
} from "@adia/core";

const DEFAULT_FIXTURE = "github-actions/deploy-staging.json";
const fixtureRoot = resolve(process.cwd(), "scripts", "fixtures");

const main = (): void => {
  const envelopePath = resolveFixtureArgument(process.argv[2]);
  const parsed = readJsonFixture(envelopePath);
  const validation = validateIngestionEnvelope(parsed);

  if (!validation.ok) {
    throw new Error(formatIssues(validation.issues));
  }

  const missingEvidence = validation.value.evidence.filter((evidence) => {
    const evidencePath = resolve(fixtureRoot, evidence.path);

    return !isPathInside(fixtureRoot, evidencePath) || !existsSync(evidencePath);
  });

  if (missingEvidence.length > 0) {
    throw new Error(
      [
        "Envelope references evidence files that do not exist:",
        ...missingEvidence.map((evidence) => `- ${evidence.path}`),
      ].join("\n"),
    );
  }

  const summary = summarizeIngestionEnvelope(validation.value);

  console.log("ADIA ingestion fixture validated");
  console.log(`Organization: ${summary.organizationSlug}`);
  console.log(`Project: ${summary.projectSlug}`);
  console.log(`Run: ${summary.runName}`);
  console.log(`Status: ${summary.status}`);
  console.log("Evidence:");

  for (const evidence of summary.evidence) {
    console.log(`- ${evidence}`);
  }
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

const readJsonFixture = (fixturePath: string): unknown => {
  if (!existsSync(fixturePath)) {
    throw new Error(`Fixture file does not exist: ${toWorkspacePath(fixturePath)}`);
  }

  return JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
};

const formatIssues = (
  issues: Array<{ path: string; message: string }>,
): string =>
  [
    "Ingestion fixture failed contract validation:",
    ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
  ].join("\n");

const isPathInside = (parentPath: string, childPath: string): boolean => {
  const childRelativePath = relative(parentPath, childPath);

  return (
    childRelativePath.length === 0 ||
    (!childRelativePath.startsWith("..") && !isAbsolute(childRelativePath))
  );
};

const toWorkspacePath = (path: string): string =>
  relative(process.cwd(), path).split(sep).join("/");

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`ADIA fixture ingestion failed\n${message}`);
  process.exitCode = 1;
}
