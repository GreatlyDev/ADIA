import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { summarizeTerraformPlan } from "../src/terraformPlanParser";

describe("summarizeTerraformPlan", () => {
  it("summarizes Terraform actions and deterministic risk signals", () => {
    const summary = summarizeTerraformPlan({
      organizationId: "org_test_001",
      deploymentRunId: "run_test_001",
      plan: {
        resource_changes: [
          {
            address: "aws_s3_bucket.app_logs",
            mode: "managed",
            type: "aws_s3_bucket",
            name: "app_logs",
            provider_name: "registry.terraform.io/hashicorp/aws",
            change: {
              actions: ["create"],
              before: null,
              after: {
                bucket: "adia-demo-staging-logs",
              },
            },
          },
          {
            address: "aws_iam_policy.deploy_permissions",
            mode: "managed",
            type: "aws_iam_policy",
            name: "deploy_permissions",
            provider_name: "registry.terraform.io/hashicorp/aws",
            change: {
              actions: ["update"],
              before: {
                policy: "{}",
              },
              after: {
                policy: JSON.stringify({
                  Version: "2012-10-17",
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: "s3:GetObject",
                      Resource: "*",
                    },
                  ],
                }),
              },
            },
          },
          {
            address: "module.network.aws_security_group.web",
            mode: "managed",
            module_address: "module.network",
            type: "aws_security_group",
            name: "web",
            provider_name: "registry.terraform.io/hashicorp/aws",
            change: {
              actions: ["delete", "create"],
              before: {
                ingress: [],
              },
              after: {
                ingress: [
                  {
                    from_port: 443,
                    to_port: 443,
                    protocol: "tcp",
                    cidr_blocks: ["0.0.0.0/0"],
                    ipv6_cidr_blocks: [],
                  },
                ],
              },
            },
          },
          {
            address: "aws_db_instance.legacy",
            mode: "managed",
            type: "aws_db_instance",
            name: "legacy",
            provider_name: "registry.terraform.io/hashicorp/aws",
            change: {
              actions: ["delete"],
              before: {
                identifier: "adia-demo-legacy",
              },
              after: null,
            },
          },
          {
            address: "aws_s3_bucket.noop",
            mode: "managed",
            type: "aws_s3_bucket",
            name: "noop",
            provider_name: "registry.terraform.io/hashicorp/aws",
            change: {
              actions: ["no-op"],
              before: {},
              after: {},
            },
          },
        ],
      },
    });

    expect(summary).toMatchObject({
      id: "tf_plan_run_test_001",
      organizationId: "org_test_001",
      deploymentRunId: "run_test_001",
      creates: 1,
      updates: 1,
      deletes: 1,
      replacements: 1,
      riskyResourceCount: 2,
      iamChangeCount: 1,
      networkingChangeCount: 1,
      publicExposureCount: 1,
    });

    expect(summary.resourceChanges).toHaveLength(4);
    expect(summary.resourceChanges[0]).toMatchObject({
      id: "tf_change_run_test_001_0",
      terraformPlanId: summary.id,
      address: "aws_s3_bucket.app_logs",
      type: "aws_s3_bucket",
      name: "app_logs",
      actions: ["create"],
      providerName: "registry.terraform.io/hashicorp/aws",
      evidencePath: "resource_changes[0]",
      riskFlags: [],
    });
    expect(summary.resourceChanges[1]?.riskFlags).toEqual(["iam_change"]);
    expect(summary.resourceChanges[2]).toMatchObject({
      actions: ["replace"],
      moduleAddress: "module.network",
      riskFlags: ["networking_change", "public_exposure"],
    });
    expect(summary.resourceChanges[3]?.actions).toEqual(["delete"]);
  });

  it("returns an empty summary for missing or invalid resource changes", () => {
    const summary = summarizeTerraformPlan({
      organizationId: "org_test_001",
      deploymentRunId: "run_empty_001",
      plan: {
        resource_changes: "not-an-array",
      },
    });

    expect(summary).toMatchObject({
      id: "tf_plan_run_empty_001",
      creates: 0,
      updates: 0,
      deletes: 0,
      replacements: 0,
      riskyResourceCount: 0,
      iamChangeCount: 0,
      networkingChangeCount: 0,
      publicExposureCount: 0,
      resourceChanges: [],
    });
  });

  it("summarizes the bundled demo Terraform plan fixture", () => {
    const fixturePlan = JSON.parse(
      readFileSync(
        new URL(
          "../../../scripts/fixtures/terraform-plans/demo-plan.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as unknown;

    const summary = summarizeTerraformPlan({
      organizationId: "org_fixture_001",
      deploymentRunId: "run_fixture_001",
      plan: fixturePlan,
    });

    expect(summary).toMatchObject({
      creates: 1,
      updates: 1,
      deletes: 1,
      replacements: 1,
      riskyResourceCount: 2,
      iamChangeCount: 1,
      networkingChangeCount: 1,
      publicExposureCount: 1,
    });
    expect(summary.resourceChanges.map((change) => change.address)).toEqual([
      "aws_s3_bucket.app_logs",
      "aws_iam_policy.deploy_permissions",
      "module.network.aws_security_group.web",
      "aws_db_instance.legacy",
    ]);
  });

  it("preserves count invariants for generated valid Terraform changes", () => {
    type GeneratedAction =
      | "create"
      | "update"
      | "delete"
      | "replace_delete_create"
      | "replace_create_delete"
      | "no_op";

    const actionMap: Record<GeneratedAction, string[]> = {
      create: ["create"],
      update: ["update"],
      delete: ["delete"],
      replace_delete_create: ["delete", "create"],
      replace_create_delete: ["create", "delete"],
      no_op: ["no-op"],
    };

    const changeArb = fc.record({
      action: fc.constantFrom<GeneratedAction>(
        "create",
        "update",
        "delete",
        "replace_delete_create",
        "replace_create_delete",
        "no_op",
      ),
      resourceType: fc.constantFrom(
        "aws_s3_bucket",
        "aws_iam_role",
        "aws_security_group",
        "aws_db_instance",
      ),
      exposesPublicly: fc.boolean(),
    });

    fc.assert(
      fc.property(fc.array(changeArb, { maxLength: 25 }), (changes) => {
        const plan = {
          resource_changes: changes.map((change, index) => ({
            address: `${change.resourceType}.generated_${index}`,
            mode: "managed",
            type: change.resourceType,
            name: `generated_${index}`,
            provider_name: "registry.terraform.io/hashicorp/aws",
            change: {
              actions: actionMap[change.action],
              before: null,
              after: change.exposesPublicly
                ? { publicly_accessible: true }
                : {},
            },
          })),
        };

        const summary = summarizeTerraformPlan({
          organizationId: "org_property_001",
          deploymentRunId: "run_property_001",
          plan,
        });

        const nonNoOpChanges = changes.filter(
          (change) => change.action !== "no_op",
        );

        expect(summary.creates).toBe(
          changes.filter((change) => change.action === "create").length,
        );
        expect(summary.updates).toBe(
          changes.filter((change) => change.action === "update").length,
        );
        expect(summary.deletes).toBe(
          changes.filter((change) => change.action === "delete").length,
        );
        expect(summary.replacements).toBe(
          changes.filter((change) => change.action.startsWith("replace"))
            .length,
        );
        expect(summary.resourceChanges).toHaveLength(nonNoOpChanges.length);
        expect(summary.riskyResourceCount).toBeLessThanOrEqual(
          summary.resourceChanges.length,
        );
        expect(summary.iamChangeCount).toBeLessThanOrEqual(
          summary.resourceChanges.length,
        );
        expect(summary.networkingChangeCount).toBeLessThanOrEqual(
          summary.resourceChanges.length,
        );
        expect(summary.publicExposureCount).toBe(
          nonNoOpChanges.filter((change) => change.exposesPublicly).length,
        );
      }),
      { numRuns: 100 },
    );
  });
});
