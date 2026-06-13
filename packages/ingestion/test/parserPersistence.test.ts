import { describe, expect, it } from "vitest";

import type { IacScanFinding, TerraformPlanSummary } from "@adia/core";

import {
  CHECKOV_PARSER_VERSION,
  TERRAFORM_PLAN_PARSER_VERSION,
  buildEvidenceLinkWriteRow,
  buildIacScanFindingWriteRows,
  buildTerraformPlanWriteRow,
  buildTerraformResourceChangeWriteRows,
} from "../src/parserPersistence";

const sourceEvidence = {
  id: "evidence-plan-1",
  path: "terraform-plans/demo-plan.json",
  contentSha256: "a".repeat(64),
};

const checkovEvidence = {
  id: "evidence-checkov-1",
  path: "checkov/demo-checkov.json",
  contentSha256: "b".repeat(64),
};

const terraformSummary = (): TerraformPlanSummary => ({
  id: "tf_plan_run-1",
  organizationId: "org-1",
  deploymentRunId: "run-1",
  creates: 1,
  updates: 1,
  deletes: 0,
  replacements: 0,
  riskyResourceCount: 1,
  iamChangeCount: 0,
  networkingChangeCount: 1,
  publicExposureCount: 1,
  resourceChanges: [
    {
      id: "tf_change_run-1_0",
      organizationId: "org-1",
      terraformPlanId: "tf_plan_run-1",
      deploymentRunId: "run-1",
      address: "aws_security_group.web",
      type: "aws_security_group",
      name: "web",
      actions: ["update"],
      providerName: "registry.terraform.io/hashicorp/aws",
      riskFlags: ["networking_change", "public_exposure"],
      evidencePath: "resource_changes[0]",
      changeSummary:
        "aws_security_group aws_security_group.web will update with networking_change, public_exposure",
    },
  ],
});

const iacFindings = (): IacScanFinding[] => [
  {
    id: "iac_finding_run-1_0",
    organizationId: "org-1",
    deploymentRunId: "run-1",
    scanner: "checkov",
    status: "failed",
    severity: "high",
    checkId: "CKV_AWS_24",
    title: "Ensure no security groups allow ingress from 0.0.0.0/0 to port 22",
    evidenceRefs: ["results.failed_checks[0]"],
    resource: "aws_security_group.web",
    filePath: "/main.tf",
    guideline: "https://docs.bridgecrew.io/docs/networking_1-port-security",
  },
];

describe("buildTerraformPlanWriteRow", () => {
  it("maps a Terraform summary into an idempotent terraform_plans write row", () => {
    const row = buildTerraformPlanWriteRow(terraformSummary(), {
      deploymentRunId: "run-1",
      organizationId: "org-1",
      sourceEvidence,
    });

    expect(row).toEqual({
      organization_id: "org-1",
      deployment_run_id: "run-1",
      source_evidence_file_id: "evidence-plan-1",
      parser_version: TERRAFORM_PLAN_PARSER_VERSION,
      source_content_sha256: "a".repeat(64),
      raw_plan: {},
      summary: {
        counts: {
          creates: 1,
          updates: 1,
          deletes: 0,
          replacements: 0,
          riskyResourceCount: 1,
          iamChangeCount: 0,
          networkingChangeCount: 1,
          publicExposureCount: 1,
        },
        parserVersion: TERRAFORM_PLAN_PARSER_VERSION,
        resourceChangeCount: 1,
        sourceEvidence: {
          id: "evidence-plan-1",
          path: "terraform-plans/demo-plan.json",
          contentSha256: "a".repeat(64),
        },
      },
      creates: 1,
      updates: 1,
      deletes: 0,
      replacements: 0,
      risky_resource_count: 1,
      iam_change_count: 0,
      networking_change_count: 1,
      public_exposure_count: 1,
    });
  });

  it("rejects Terraform summaries for the wrong run scope", () => {
    expect(() =>
      buildTerraformPlanWriteRow(terraformSummary(), {
        deploymentRunId: "other-run",
        organizationId: "org-1",
        sourceEvidence,
      }),
    ).toThrow("Terraform summary does not match the persistence scope.");
  });
});

describe("buildTerraformResourceChangeWriteRows", () => {
  it("adds deterministic fingerprints to Terraform resource change rows", () => {
    const first = buildTerraformResourceChangeWriteRows(
      terraformSummary().resourceChanges,
      {
        deploymentRunId: "run-1",
        organizationId: "org-1",
        parserVersion: TERRAFORM_PLAN_PARSER_VERSION,
        terraformPlanId: "persisted-plan-1",
      },
    );
    const second = buildTerraformResourceChangeWriteRows(
      terraformSummary().resourceChanges,
      {
        deploymentRunId: "run-1",
        organizationId: "org-1",
        parserVersion: TERRAFORM_PLAN_PARSER_VERSION,
        terraformPlanId: "persisted-plan-1",
      },
    );

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      organization_id: "org-1",
      deployment_run_id: "run-1",
      terraform_plan_id: "persisted-plan-1",
      parser_version: TERRAFORM_PLAN_PARSER_VERSION,
      address: "aws_security_group.web",
      type: "aws_security_group",
      name: "web",
      actions: ["update"],
      provider_name: "registry.terraform.io/hashicorp/aws",
      module_address: null,
      risk_flags: ["networking_change", "public_exposure"],
      evidence_path: "resource_changes[0]",
    });
    expect(first[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first[0]?.fingerprint).toBe(second[0]?.fingerprint);
  });
});

describe("buildIacScanFindingWriteRows", () => {
  it("maps Checkov findings into idempotent iac_scan_findings write rows", () => {
    const rows = buildIacScanFindingWriteRows(iacFindings(), {
      deploymentRunId: "run-1",
      organizationId: "org-1",
      parserVersion: CHECKOV_PARSER_VERSION,
      sourceEvidence: checkovEvidence,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: "org-1",
      deployment_run_id: "run-1",
      source_evidence_file_id: "evidence-checkov-1",
      parser_version: CHECKOV_PARSER_VERSION,
      source_content_sha256: "b".repeat(64),
      scanner: "checkov",
      status: "failed",
      severity: "high",
      check_id: "CKV_AWS_24",
      title:
        "Ensure no security groups allow ingress from 0.0.0.0/0 to port 22",
      resource: "aws_security_group.web",
      file_path: "/main.tf",
      guideline: "https://docs.bridgecrew.io/docs/networking_1-port-security",
      evidence_refs: ["results.failed_checks[0]"],
      raw_finding: {
        evidenceRefs: ["results.failed_checks[0]"],
        parserVersion: CHECKOV_PARSER_VERSION,
        sourceEvidence: {
          id: "evidence-checkov-1",
          path: "checkov/demo-checkov.json",
          contentSha256: "b".repeat(64),
        },
      },
    });
    expect(rows[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("buildEvidenceLinkWriteRow", () => {
  it("builds a duplicate-safe evidence link row with a required label", () => {
    const row = buildEvidenceLinkWriteRow({
      deploymentRunId: "run-1",
      label: "parsed_from",
      metadata: {
        parserVersion: TERRAFORM_PLAN_PARSER_VERSION,
        sourcePath: "terraform-plans/demo-plan.json",
      },
      organizationId: "org-1",
      sourceId: "evidence-plan-1",
      sourceTable: "raw_evidence_files",
      targetId: "persisted-plan-1",
      targetTable: "terraform_plans",
    });

    expect(row).toEqual({
      organization_id: "org-1",
      deployment_run_id: "run-1",
      source_table: "raw_evidence_files",
      source_id: "evidence-plan-1",
      target_table: "terraform_plans",
      target_id: "persisted-plan-1",
      label: "parsed_from",
      metadata: {
        parserVersion: TERRAFORM_PLAN_PARSER_VERSION,
        sourcePath: "terraform-plans/demo-plan.json",
      },
    });
  });
});
