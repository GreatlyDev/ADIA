import type { TerraformPlanSummary } from "@adia/core";

export interface TerraformPlanParserInput {
  organizationId: string;
  deploymentRunId: string;
  plan: unknown;
}

export function summarizeTerraformPlan({
  organizationId,
  deploymentRunId,
  plan,
}: TerraformPlanParserInput): TerraformPlanSummary {
  void plan;

  // TODO(Phase 3): Parse `terraform show -json` output into resource changes,
  // action counts, IAM/networking risk flags, and public exposure signals.
  return {
    id: `tf_plan_placeholder_${deploymentRunId}`,
    organizationId,
    deploymentRunId,
    creates: 0,
    updates: 0,
    deletes: 0,
    replacements: 0,
    riskyResourceCount: 0,
    iamChangeCount: 0,
    networkingChangeCount: 0,
    publicExposureCount: 0,
    resourceChanges: [],
  };
}
