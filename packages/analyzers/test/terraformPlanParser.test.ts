import { describe, expect, it } from "vitest";
import { summarizeTerraformPlan } from "../src/terraformPlanParser";

describe("summarizeTerraformPlan", () => {
  it("returns an empty placeholder summary until real Terraform parsing is implemented", () => {
    const summary = summarizeTerraformPlan({
      organizationId: "org_test_001",
      deploymentRunId: "run_test_001",
      plan: {},
    });

    expect(summary).toMatchObject({
      organizationId: "org_test_001",
      deploymentRunId: "run_test_001",
      creates: 0,
      updates: 0,
      deletes: 0,
      replacements: 0,
      resourceChanges: [],
    });
  });
});
