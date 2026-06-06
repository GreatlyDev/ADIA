import {
  validateIngestionEnvelope,
  type IngestionEnvelope,
  type IngestionEvidenceRef,
  type DeploymentStatus,
} from "@adia/core";

export interface GitHubWorkflowRunEvent {
  action?: string;
  workflow?: {
    id?: number;
    name?: string;
    path?: string;
  };
  workflow_run?: {
    id?: number;
    name?: string;
    event?: string;
    status?: string;
    conclusion?: string | null;
    html_url?: string;
    run_started_at?: string;
    updated_at?: string;
    head_branch?: string;
    head_sha?: string;
    actor?: {
      login?: string;
    };
  };
  repository?: {
    id?: number;
    name?: string;
    full_name?: string;
    html_url?: string;
    owner?: {
      login?: string;
    };
  };
}

export interface GitHubActionsAdapterOptions {
  organizationSlug: string;
  projectSlug: string;
  environment: string;
  evidence: readonly IngestionEvidenceRef[];
}

export class GitHubActionsAdapterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "GitHubActionsAdapterError";
  }
}

export const githubWorkflowRunEventToIngestionEnvelope = (
  event: GitHubWorkflowRunEvent,
  options: GitHubActionsAdapterOptions,
): IngestionEnvelope => {
  const run = requireWorkflowRun(event.workflow_run);
  const workflow = event.workflow;
  const repository = event.repository;

  const envelope: IngestionEnvelope = {
    schemaVersion: "adia.ingestion.v1",
    source: "github_actions",
    organizationSlug: options.organizationSlug,
    projectSlug: options.projectSlug,
    run: {
      externalId: String(run.id),
      name: run.name,
      status: mapGitHubWorkflowRunStatus(run.status, run.conclusion ?? null),
      environment: options.environment,
      startedAt: toIsoTimestamp(run.run_started_at),
      completedAt:
        run.status === "completed" && run.updated_at
          ? toIsoTimestamp(run.updated_at)
          : undefined,
      commitSha: run.head_sha,
      branch: run.head_branch,
      actor: run.actor?.login,
      url: run.html_url,
      metadata: {
        event: run.event,
        workflowId: workflow?.id,
        workflowName: workflow?.name,
        workflowPath: workflow?.path,
        repositoryId: repository?.id,
        repository: repository?.full_name,
        repositoryUrl: repository?.html_url,
        repositoryOwner: repository?.owner?.login,
        githubAction: event.action,
      },
    },
    evidence: [...options.evidence],
    metadata: {
      adapter: "github_actions_workflow_run",
    },
  };

  const validation = validateIngestionEnvelope(envelope);

  if (!validation.ok) {
    throw new GitHubActionsAdapterError(
      "invalid_envelope",
      "GitHub Actions event mapped to an invalid ADIA ingestion envelope.",
      validation.issues,
    );
  }

  return validation.value;
};

export const mapGitHubWorkflowRunStatus = (
  status: string,
  conclusion: string | null,
): DeploymentStatus => {
  if (
    status === "queued" ||
    status === "requested" ||
    status === "waiting" ||
    status === "pending"
  ) {
    return "queued";
  }

  if (status === "in_progress") {
    return "running";
  }

  if (status !== "completed") {
    return "running";
  }

  if (conclusion === "success" || conclusion === "neutral") {
    return "succeeded";
  }

  if (conclusion === "cancelled" || conclusion === "skipped") {
    return "canceled";
  }

  return "failed";
};

const assertPresent = (value: unknown, path: string): void => {
  if (value === undefined || value === null || value === "") {
    throw new GitHubActionsAdapterError(
      "invalid_github_event",
      `GitHub workflow_run event is missing ${path}.`,
    );
  }
};

type RequiredWorkflowRun = NonNullable<GitHubWorkflowRunEvent["workflow_run"]> &
  Required<
    Pick<
      NonNullable<GitHubWorkflowRunEvent["workflow_run"]>,
      "id" | "name" | "status" | "run_started_at" | "head_branch" | "head_sha"
    >
  >;

const requireWorkflowRun = (
  run: GitHubWorkflowRunEvent["workflow_run"],
): RequiredWorkflowRun => {
  if (!run) {
    throw new GitHubActionsAdapterError(
      "invalid_github_event",
      "GitHub workflow_run event is missing workflow_run.",
    );
  }

  assertPresent(run.id, "workflow_run.id");
  assertPresent(run.name, "workflow_run.name");
  assertPresent(run.status, "workflow_run.status");
  assertPresent(run.run_started_at, "workflow_run.run_started_at");
  assertPresent(run.head_branch, "workflow_run.head_branch");
  assertPresent(run.head_sha, "workflow_run.head_sha");

  return run as RequiredWorkflowRun;
};

const toIsoTimestamp = (value: string): string => new Date(value).toISOString();
