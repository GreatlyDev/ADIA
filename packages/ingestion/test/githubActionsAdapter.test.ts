import { describe, expect, it } from "vitest";

import { validateIngestionEnvelope, type IngestionEnvelope } from "@adia/core";

import {
  GitHubActionsAdapterError,
  githubWorkflowRunEventToIngestionEnvelope,
  mapGitHubWorkflowRunStatus,
  type GitHubWorkflowRunEvent,
} from "../src/githubActionsAdapter";

const workflowRunEvent = (): GitHubWorkflowRunEvent => ({
  action: "completed",
  workflow: {
    id: 42,
    name: "Deploy staging",
    path: ".github/workflows/deploy-staging.yml",
  },
  workflow_run: {
    id: 123456789,
    name: "Deploy staging",
    event: "push",
    status: "completed",
    conclusion: "success",
    html_url: "https://github.com/GreatlyDev/ADIA/actions/runs/123456789",
    run_started_at: "2026-01-15T12:00:00Z",
    updated_at: "2026-01-15T12:07:30Z",
    head_branch: "main",
    head_sha: "0123456789abcdef0123456789abcdef01234567",
    actor: {
      login: "GreatlyDev",
    },
  },
  repository: {
    id: 987654321,
    name: "ADIA",
    full_name: "GreatlyDev/ADIA",
    html_url: "https://github.com/GreatlyDev/ADIA",
    owner: {
      login: "GreatlyDev",
    },
  },
});

const adapterOptions = {
  organizationSlug: "adia-demo-org",
  projectSlug: "adia-demo-service",
  environment: "staging",
  evidence: [
    {
      kind: "terraform_plan",
      format: "terraform_show_json",
      path: "terraform-plans/demo-plan.json",
      label: "Demo Terraform plan JSON",
    },
    {
      kind: "iac_scan",
      format: "checkov_json",
      path: "checkov/demo-checkov.json",
      label: "Demo Checkov scan JSON",
    },
    {
      kind: "log",
      format: "plain_text",
      path: "logs/deploy-staging.log",
      label: "Demo deployment log",
    },
  ],
} as const;

describe("githubWorkflowRunEventToIngestionEnvelope", () => {
  it("maps a completed GitHub workflow_run event into a valid ADIA ingestion envelope", () => {
    const envelope = githubWorkflowRunEventToIngestionEnvelope(
      workflowRunEvent(),
      adapterOptions,
    );

    expect(envelope).toEqual<IngestionEnvelope>({
      schemaVersion: "adia.ingestion.v1",
      source: "github_actions",
      organizationSlug: "adia-demo-org",
      projectSlug: "adia-demo-service",
      run: {
        externalId: "123456789",
        name: "Deploy staging",
        status: "succeeded",
        environment: "staging",
        startedAt: "2026-01-15T12:00:00.000Z",
        completedAt: "2026-01-15T12:07:30.000Z",
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        branch: "main",
        actor: "GreatlyDev",
        url: "https://github.com/GreatlyDev/ADIA/actions/runs/123456789",
        metadata: {
          event: "push",
          workflowId: 42,
          workflowName: "Deploy staging",
          workflowPath: ".github/workflows/deploy-staging.yml",
          repositoryId: 987654321,
          repository: "GreatlyDev/ADIA",
          repositoryUrl: "https://github.com/GreatlyDev/ADIA",
          repositoryOwner: "GreatlyDev",
          githubAction: "completed",
        },
      },
      evidence: [...adapterOptions.evidence],
      metadata: {
        adapter: "github_actions_workflow_run",
      },
    });

    expect(validateIngestionEnvelope(envelope).ok).toBe(true);
  });

  it("rejects unsafe evidence paths through envelope validation", () => {
    const execute = (): IngestionEnvelope =>
      githubWorkflowRunEventToIngestionEnvelope(workflowRunEvent(), {
        ...adapterOptions,
        evidence: [
          {
            kind: "log",
            format: "plain_text",
            path: "../secrets.env",
          },
        ],
      });

    expect(execute).toThrow(GitHubActionsAdapterError);

    try {
      execute();
    } catch (error) {
      expect(error).toMatchObject({
        code: "invalid_envelope",
        message:
          "GitHub Actions event mapped to an invalid ADIA ingestion envelope.",
        details: [
          {
            path: "evidence[0].path",
            message: "Expected a safe relative fixture path.",
          },
        ],
      });
    }
  });

  it("rejects workflow_run events missing required run metadata", () => {
    const event = workflowRunEvent();
    event.workflow_run!.id = undefined;

    expect(() =>
      githubWorkflowRunEventToIngestionEnvelope(event, adapterOptions),
    ).toThrowError(
      new GitHubActionsAdapterError(
        "invalid_github_event",
        "GitHub workflow_run event is missing workflow_run.id.",
      ),
    );
  });
});

describe("mapGitHubWorkflowRunStatus", () => {
  it.each([
    ["queued", null, "queued"],
    ["requested", null, "queued"],
    ["waiting", null, "queued"],
    ["pending", null, "queued"],
    ["in_progress", null, "running"],
    ["completed", "success", "succeeded"],
    ["completed", "neutral", "succeeded"],
    ["completed", "cancelled", "canceled"],
    ["completed", "skipped", "canceled"],
    ["completed", "failure", "failed"],
    ["completed", "timed_out", "failed"],
    ["completed", "action_required", "failed"],
    ["completed", "stale", "failed"],
    ["completed", "something_new", "failed"],
  ] as const)(
    "maps GitHub status %s with conclusion %s to ADIA status %s",
    (status, conclusion, expected) => {
      expect(mapGitHubWorkflowRunStatus(status, conclusion)).toBe(expected);
    },
  );
});
