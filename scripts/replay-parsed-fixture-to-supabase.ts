import {
  DEFAULT_REPLAY_FIXTURE,
  createSupabaseServerClient,
  replayParsedFixture,
} from "@adia/ingestion";

const main = async (): Promise<void> => {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const fixturePath = process.argv[2] ?? DEFAULT_REPLAY_FIXTURE;
  const supabase = createSupabaseServerClient();
  const result = await replayParsedFixture(supabase, {
    fixturePath,
  });

  console.log("ADIA parsed fixture replay complete");
  console.log(`Organization: ${result.organizationId}`);
  console.log(`Deployment run: ${result.deploymentRunId}`);
  console.log(`Raw evidence files: ${result.rawEvidenceFileCount}`);
  console.log(`Terraform plan: ${result.terraformPlanId ?? "none"}`);
  console.log(
    `Terraform resource changes: ${result.terraformResourceChangeCount}`,
  );
  console.log(`Checkov findings: ${result.checkovFindingCount}`);
  console.log(`Anomalies: ${result.anomalyCount}`);
  console.log(`Parser evidence links: ${result.parserEvidenceLinkCount}`);
  console.log(`Anomaly evidence links: ${result.anomalyEvidenceLinkCount}`);
  console.log(`Total evidence links: ${result.evidenceLinkCount}`);
};

const printHelp = (): void => {
  console.log(`Usage: pnpm exec tsx scripts/replay-parsed-fixture-to-supabase.ts [fixture-path]

Validates one ADIA fixture envelope, writes deployment_runs and
raw_evidence_files metadata, reads local Terraform and Checkov JSON
fixtures, runs deterministic parsers, persists parser output to Supabase,
and persists deterministic anomalies from the persisted parser rows.

Arguments:
  fixture-path  Path relative to scripts/fixtures.
                Defaults to ${DEFAULT_REPLAY_FIXTURE}.

Required environment:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Alternative RLS-authenticated environment:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_INGESTION_ACCESS_TOKEN

This script does not expose API routes, call LLMs, execute Terraform,
execute Checkov, fetch artifacts, or run cloud commands.`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`ADIA parsed fixture replay failed\n${message}`);
  process.exitCode = 1;
});
