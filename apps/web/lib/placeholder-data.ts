import type {
  Anomaly,
  DeploymentRun,
  Insight,
  Recommendation,
  TerraformPlanSummary,
} from "@adia/core";
import type { PlannedModule } from "../components/module-card";
import type { StatusCardProps } from "../components/status-card";

export const deploymentRuns: DeploymentRun[] = [
  {
    id: "run_demo_001",
    projectId: "project_demo_platform",
    name: "Checkout API staging deploy",
    status: "succeeded",
    environment: "staging",
    commitSha: "8f31a90",
    source: "github_actions",
    startedAt: "phase-0-demo-start",
    completedAt: "phase-0-demo-complete",
    durationSeconds: 360,
  },
  {
    id: "run_demo_002",
    projectId: "project_demo_platform",
    name: "Worker image rollout",
    status: "running",
    environment: "production",
    commitSha: "19ac4db",
    source: "github_actions",
    startedAt: "phase-0-demo-running-start",
    durationSeconds: 180,
  },
  {
    id: "run_demo_003",
    projectId: "project_demo_platform",
    name: "Terraform network preview",
    status: "queued",
    environment: "dev",
    commitSha: "df5b7aa",
    source: "fixture",
    startedAt: "phase-0-demo-queued-start",
    durationSeconds: 0,
  },
];

export const terraformSummary: TerraformPlanSummary = {
  id: "tf_plan_demo_001",
  deploymentRunId: "run_demo_003",
  creates: 3,
  updates: 2,
  deletes: 0,
  replacements: 1,
  riskyResourceCount: 0,
  iamChangeCount: 0,
  networkingChangeCount: 1,
  publicExposureCount: 0,
  resourceChanges: [],
};

export const anomalyPreview: Anomaly = {
  id: "anomaly_demo_001",
  deploymentRunId: "run_demo_002",
  severity: "medium",
  title: "Duration drift placeholder",
  summary:
    "Future deterministic rules will compare run duration, status patterns, and Terraform blast radius before LLM analysis.",
  evidenceRefs: ["run_demo_002"],
  detectedAt: "phase-0-demo-detected",
};

export const insightPreview: Insight = {
  id: "insight_demo_001",
  deploymentRunId: "run_demo_003",
  severity: "info",
  title: "Structured AI insight placeholder",
  summary:
    "Future server-side LLM output will summarize deterministic findings and cite evidence instead of executing remediation.",
  evidenceRefs: ["tf_plan_demo_001", "anomaly_demo_001"],
  createdAt: "phase-0-demo-created",
};

export const recommendations: Recommendation[] = [
  {
    id: "rec_demo_001",
    deploymentRunId: "run_demo_003",
    severity: "medium",
    title: "Review networking change evidence",
    summary:
      "Recommendation records will point to Terraform resources, scan findings, logs, or commits that support the guidance.",
    evidenceRefs: ["tf_plan_demo_001"],
    status: "open",
    createdAt: "phase-0-demo-recommendation-created",
  },
  {
    id: "rec_demo_002",
    deploymentRunId: "run_demo_002",
    severity: "low",
    title: "Compare duration against baseline",
    summary:
      "Anomaly recommendations will come from deterministic signals before any LLM summary is generated.",
    evidenceRefs: ["anomaly_demo_001"],
    status: "open",
    createdAt: "phase-0-demo-recommendation-created",
  },
];

export const dashboardMetrics: StatusCardProps[] = [
  {
    title: "Deployment Runs",
    value: "3",
    detail: "Static Phase 0 demo records.",
    tone: "success",
  },
  {
    title: "Terraform Risk",
    value: "Planned",
    detail: "Parser implementation starts in a later phase.",
    tone: "warning",
  },
  {
    title: "Anomalies",
    value: "Stub",
    detail: "Deterministic rules are not implemented yet.",
    tone: "danger",
  },
  {
    title: "AI Insights",
    value: "Server-only",
    detail: "No LLM calls exist in Phase 0.",
    tone: "insight",
  },
];

export const plannedModules: PlannedModule[] = [
  {
    title: "Deployment Runs",
    label: "CI/CD",
    description:
      "Future ingestion will capture run metadata, status, commit, environment, and duration.",
  },
  {
    title: "Terraform Risk",
    label: "Plan analysis",
    description:
      "Future parsing will summarize creates, updates, deletes, replacements, IAM, networking, and exposure risk.",
  },
  {
    title: "Anomalies",
    label: "Rules first",
    description:
      "Future deterministic checks will flag suspicious changes before LLM summarization.",
  },
  {
    title: "AI Insights",
    label: "Evidence grounded",
    description:
      "Future server-side LLM output will use structured JSON and cited evidence.",
  },
  {
    title: "Recommendations",
    label: "Advisory only",
    description:
      "Future recommendations will explain next steps without executing infrastructure changes.",
  },
];
