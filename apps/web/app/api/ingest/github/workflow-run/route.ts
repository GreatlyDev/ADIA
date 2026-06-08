import { NextResponse, type NextRequest } from "next/server";

import {
  createSupabaseServerClient,
  gitHubWebhookConfigErrorToResult,
  gitHubWebhookPersistenceErrorToResult,
  loadGitHubWorkflowRunWebhookConfig,
  parseGitHubWebhookDryRun,
  persistGitHubWorkflowRunWebhookEnvelope,
  processGitHubWorkflowRunWebhook,
} from "@adia/ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const payload = await request.text();
  const deliveryId = request.headers.get("x-github-delivery");

  let config;

  try {
    config = loadGitHubWorkflowRunWebhookConfig({
      GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
      ADIA_GITHUB_WEBHOOK_ORGANIZATION_SLUG:
        process.env.ADIA_GITHUB_WEBHOOK_ORGANIZATION_SLUG,
      ADIA_GITHUB_WEBHOOK_PROJECT_SLUG:
        process.env.ADIA_GITHUB_WEBHOOK_PROJECT_SLUG,
      ADIA_GITHUB_WEBHOOK_ENVIRONMENT:
        process.env.ADIA_GITHUB_WEBHOOK_ENVIRONMENT,
      ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON:
        process.env.ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON,
    });
  } catch (error) {
    const result = gitHubWebhookConfigErrorToResult(error, deliveryId);
    return NextResponse.json(result.body, { status: result.status });
  }

  const dryRun = parseGitHubWebhookDryRun(
    request.nextUrl.searchParams.get("dryRun"),
  );
  const result = processGitHubWorkflowRunWebhook({
    payload,
    eventName: request.headers.get("x-github-event"),
    signature256: request.headers.get("x-hub-signature-256"),
    deliveryId,
    config,
    dryRun,
  });

  if (!("envelope" in result) || result.body.dryRun) {
    return NextResponse.json(result.body, { status: result.status });
  }

  try {
    const persistedResult = await persistGitHubWorkflowRunWebhookEnvelope({
      client: createSupabaseServerClient(),
      deliveryId,
      envelope: result.envelope,
    });

    return NextResponse.json(persistedResult.body, {
      status: persistedResult.status,
    });
  } catch (error) {
    const persistenceError = gitHubWebhookPersistenceErrorToResult(
      error,
      deliveryId,
    );

    return NextResponse.json(persistenceError.body, {
      status: persistenceError.status,
    });
  }
};
