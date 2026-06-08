import { createHmac, timingSafeEqual } from "node:crypto";

import {
  summarizeIngestionEnvelope,
  type IngestionEnvelope,
  type IngestionEnvelopeSummary,
  type IngestionEvidenceRef,
} from "@adia/core";

import {
  GitHubActionsAdapterError,
  githubWorkflowRunEventToIngestionEnvelope,
  type GitHubActionsAdapterOptions,
  type GitHubWorkflowRunEvent,
} from "./githubActionsAdapter";
import {
  SupabaseFixtureIngestionError,
  ingestFixtureEnvelope,
  type SupabaseFixtureIngestionResult,
  type SupabaseIngestionClient,
} from "./supabaseFixtureIngestion";

export interface GitHubWorkflowRunWebhookEnv {
  GITHUB_WEBHOOK_SECRET?: string;
  ADIA_GITHUB_WEBHOOK_ORGANIZATION_SLUG?: string;
  ADIA_GITHUB_WEBHOOK_PROJECT_SLUG?: string;
  ADIA_GITHUB_WEBHOOK_ENVIRONMENT?: string;
  ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON?: string;
}

export interface GitHubWorkflowRunWebhookConfig {
  secret: string;
  adapterOptions: GitHubActionsAdapterOptions;
}

export interface VerifyGitHubWebhookSignatureInput {
  payload: string;
  signature256: string | null | undefined;
  secret: string;
}

export interface ProcessGitHubWorkflowRunWebhookInput {
  payload: string;
  eventName: string | null | undefined;
  signature256: string | null | undefined;
  deliveryId?: string | null;
  config: GitHubWorkflowRunWebhookConfig;
  dryRun: boolean;
}

export interface PersistGitHubWorkflowRunWebhookEnvelopeInput {
  client: SupabaseIngestionClient;
  envelope: IngestionEnvelope;
  deliveryId?: string | null;
}

export interface GitHubWebhookErrorBody {
  ok: false;
  deliveryId?: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface GitHubWebhookIgnoredBody {
  ok: true;
  ignored: true;
  event: string | null;
  deliveryId?: string;
  reason: string;
}

export interface GitHubWorkflowRunWebhookMappedBody {
  ok: true;
  dryRun: boolean;
  persisted: false;
  event: "workflow_run";
  deliveryId?: string;
  summary: IngestionEnvelopeSummary;
  envelope?: IngestionEnvelope;
  message: string;
}

export interface GitHubWorkflowRunWebhookPersistedBody {
  ok: true;
  dryRun: false;
  persisted: true;
  event: "workflow_run";
  deliveryId?: string;
  summary: IngestionEnvelopeSummary;
  deploymentRun: {
    id: string;
    organizationId: string;
    projectId: string;
    name: string;
  };
  rawEvidenceFiles: SupabaseFixtureIngestionResult["rawEvidenceFiles"];
  message: string;
}

export type GitHubWorkflowRunWebhookSuccessBody =
  | GitHubWorkflowRunWebhookMappedBody
  | GitHubWorkflowRunWebhookPersistedBody;

export type GitHubWorkflowRunWebhookResult =
  | {
      status: 200 | 202;
      body: GitHubWorkflowRunWebhookMappedBody;
      envelope: IngestionEnvelope;
    }
  | {
      status: 202;
      body: GitHubWebhookIgnoredBody;
    }
  | {
      status: 200;
      body: GitHubWorkflowRunWebhookPersistedBody;
    }
  | {
      status: 400 | 401 | 422 | 500;
      body: GitHubWebhookErrorBody;
    };

export class GitHubWorkflowRunWebhookConfigError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GitHubWorkflowRunWebhookConfigError";
  }
}

export const loadGitHubWorkflowRunWebhookConfig = (
  env: GitHubWorkflowRunWebhookEnv,
): GitHubWorkflowRunWebhookConfig => {
  const secret = requireEnvValue(
    env.GITHUB_WEBHOOK_SECRET,
    "GITHUB_WEBHOOK_SECRET",
    "GITHUB_WEBHOOK_SECRET is required for GitHub webhook ingestion.",
  );

  const evidenceJson = requireEnvValue(
    env.ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON,
    "ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON",
    "ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON is required for GitHub webhook ingestion.",
  );

  const parsedEvidence = parseEvidenceJson(evidenceJson);

  return {
    secret,
    adapterOptions: {
      organizationSlug: requireEnvValue(
        env.ADIA_GITHUB_WEBHOOK_ORGANIZATION_SLUG,
        "ADIA_GITHUB_WEBHOOK_ORGANIZATION_SLUG",
        "ADIA_GITHUB_WEBHOOK_ORGANIZATION_SLUG is required for GitHub webhook ingestion.",
      ),
      projectSlug: requireEnvValue(
        env.ADIA_GITHUB_WEBHOOK_PROJECT_SLUG,
        "ADIA_GITHUB_WEBHOOK_PROJECT_SLUG",
        "ADIA_GITHUB_WEBHOOK_PROJECT_SLUG is required for GitHub webhook ingestion.",
      ),
      environment: requireEnvValue(
        env.ADIA_GITHUB_WEBHOOK_ENVIRONMENT,
        "ADIA_GITHUB_WEBHOOK_ENVIRONMENT",
        "ADIA_GITHUB_WEBHOOK_ENVIRONMENT is required for GitHub webhook ingestion.",
      ),
      evidence: parsedEvidence,
    },
  };
};

export const verifyGitHubWebhookSignature = ({
  payload,
  signature256,
  secret,
}: VerifyGitHubWebhookSignatureInput): boolean => {
  if (!secret.trim() || !signature256?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(signature256, "utf8");

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
};

export const parseGitHubWebhookDryRun = (
  value: string | null | undefined,
): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  return ["1", "true", "yes"].includes(value.toLowerCase());
};

export const processGitHubWorkflowRunWebhook = ({
  payload,
  eventName,
  signature256,
  deliveryId,
  config,
  dryRun,
}: ProcessGitHubWorkflowRunWebhookInput): GitHubWorkflowRunWebhookResult => {
  if (!config.secret.trim()) {
    return errorResult(500, deliveryId, {
      code: "missing_webhook_secret",
      message:
        "GITHUB_WEBHOOK_SECRET is required for GitHub webhook ingestion.",
    });
  }

  const signatureOk = verifyGitHubWebhookSignature({
    payload,
    signature256,
    secret: config.secret,
  });

  if (!signatureOk) {
    return errorResult(401, deliveryId, {
      code: "invalid_signature",
      message: "GitHub webhook signature verification failed.",
    });
  }

  if (eventName !== "workflow_run") {
    return {
      status: 202,
      body: {
        ok: true,
        ignored: true,
        event: eventName ?? null,
        ...(deliveryId ? { deliveryId } : {}),
        reason: "Only workflow_run events are handled in Phase 2D.",
      },
    };
  }

  const event = parseJsonPayload(payload);

  if (!event.ok) {
    return errorResult(400, deliveryId, {
      code: "invalid_json",
      message: "GitHub webhook payload must be valid JSON.",
      details: event.details,
    });
  }

  try {
    const envelope = githubWorkflowRunEventToIngestionEnvelope(
      event.value as GitHubWorkflowRunEvent,
      config.adapterOptions,
    );
    const summary = summarizeIngestionEnvelope(envelope);

    return {
      status: dryRun ? 200 : 202,
      envelope,
      body: {
        ok: true,
        dryRun,
        persisted: false,
        event: "workflow_run",
        ...(deliveryId ? { deliveryId } : {}),
        summary,
        ...(dryRun ? { envelope } : {}),
        message: dryRun
          ? "Dry run only. No Supabase write was performed."
          : "Webhook verified and mapped. Persistence is intentionally not implemented in Phase 2D.",
      },
    };
  } catch (error) {
    if (error instanceof GitHubActionsAdapterError) {
      return errorResult(422, deliveryId, {
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    return errorResult(500, deliveryId, {
      code: "unexpected_webhook_error",
      message: "GitHub workflow_run webhook processing failed.",
    });
  }
};

export const persistGitHubWorkflowRunWebhookEnvelope = async ({
  client,
  envelope,
  deliveryId,
}: PersistGitHubWorkflowRunWebhookEnvelopeInput): Promise<GitHubWorkflowRunWebhookResult> => {
  const result = await ingestFixtureEnvelope(client, envelope);

  return {
    status: 200,
    body: {
      ok: true,
      dryRun: false,
      persisted: true,
      event: "workflow_run",
      ...(deliveryId ? { deliveryId } : {}),
      summary: summarizeIngestionEnvelope(envelope),
      deploymentRun: {
        id: result.deploymentRun.id,
        organizationId: result.deploymentRun.organization_id,
        projectId: result.deploymentRun.project_id,
        name: result.deploymentRun.name,
      },
      rawEvidenceFiles: result.rawEvidenceFiles,
      message: "Webhook verified, mapped, and persisted to Supabase.",
    },
  };
};

export const gitHubWebhookConfigErrorToResult = (
  error: unknown,
  deliveryId?: string | null,
): GitHubWorkflowRunWebhookResult => {
  if (error instanceof GitHubWorkflowRunWebhookConfigError) {
    return errorResult(500, deliveryId, {
      code: error.code,
      message: error.message,
    });
  }

  return errorResult(500, deliveryId, {
    code: "invalid_webhook_configuration",
    message: "GitHub webhook ingestion configuration is invalid.",
  });
};

export const gitHubWebhookPersistenceErrorToResult = (
  error: unknown,
  deliveryId?: string | null,
): GitHubWorkflowRunWebhookResult => {
  if (error instanceof SupabaseFixtureIngestionError) {
    return errorResult(500, deliveryId, {
      code: error.code,
      message: error.message,
      details: error.details,
    });
  }

  return errorResult(500, deliveryId, {
    code: "webhook_persistence_failed",
    message: "GitHub workflow_run webhook persistence failed.",
  });
};

const requireEnvValue = (
  value: string | undefined,
  code: string,
  message: string,
): string => {
  if (!value?.trim()) {
    throw new GitHubWorkflowRunWebhookConfigError(code, message);
  }

  return value;
};

const parseEvidenceJson = (value: string): readonly IngestionEvidenceRef[] => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new GitHubWorkflowRunWebhookConfigError(
      "ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON",
      "ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON must be valid JSON.",
    );
  }

  if (!Array.isArray(parsed)) {
    throw new GitHubWorkflowRunWebhookConfigError(
      "ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON",
      "ADIA_GITHUB_WEBHOOK_EVIDENCE_JSON must be a JSON array.",
    );
  }

  return parsed as readonly IngestionEvidenceRef[];
};

const parseJsonPayload = (
  payload: string,
):
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      details: string;
    } => {
  try {
    return {
      ok: true,
      value: JSON.parse(payload),
    };
  } catch (error) {
    return {
      ok: false,
      details: error instanceof Error ? error.message : "Unknown JSON error.",
    };
  }
};

const errorResult = (
  status: 400 | 401 | 422 | 500,
  deliveryId: string | null | undefined,
  error: GitHubWebhookErrorBody["error"],
): GitHubWorkflowRunWebhookResult => ({
  status,
  body: {
    ok: false,
    ...(deliveryId ? { deliveryId } : {}),
    error: omitUndefinedDetails(error),
  },
});

const omitUndefinedDetails = (
  error: GitHubWebhookErrorBody["error"],
): GitHubWebhookErrorBody["error"] => {
  if (error.details === undefined) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return error;
};
