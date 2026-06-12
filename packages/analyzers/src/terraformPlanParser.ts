import type {
  TerraformPlanSummary,
  TerraformResourceAction,
  TerraformResourceChange,
} from "@adia/core";

export interface TerraformPlanParserInput {
  organizationId: string;
  deploymentRunId: string;
  plan: unknown;
}

type RiskFlag = "iam_change" | "networking_change" | "public_exposure";

type TerraformResourceChangeJson = Record<string, unknown> & {
  address?: unknown;
  type?: unknown;
  name?: unknown;
  provider_name?: unknown;
  module_address?: unknown;
  change?: unknown;
};

type TerraformChangeJson = Record<string, unknown> & {
  actions?: unknown;
  before?: unknown;
  after?: unknown;
  after_unknown?: unknown;
};

const PUBLIC_CIDR_VALUES = new Set(["0.0.0.0/0", "::/0"]);
const PUBLIC_ACCESS_BLOCK_KEYS = new Set([
  "block_public_acls",
  "block_public_policy",
  "ignore_public_acls",
  "restrict_public_buckets",
]);

const NETWORKING_MARKERS = [
  "security_group",
  "firewall",
  "route",
  "route_table",
  "network_acl",
  "subnet",
  "vpc",
  "load_balancer",
  "listener",
  "gateway",
  "nat_gateway",
  "internet_gateway",
];

export function summarizeTerraformPlan({
  organizationId,
  deploymentRunId,
  plan,
}: TerraformPlanParserInput): TerraformPlanSummary {
  const planId = `tf_plan_${deploymentRunId}`;
  const resourceChanges = extractResourceChanges(plan);

  const summary: TerraformPlanSummary = {
    id: planId,
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

  resourceChanges.forEach((resourceChange, index) => {
    const actions = normalizeActions(getTerraformActions(resourceChange));

    if (actions.length === 0 || actions.includes("no_op")) {
      return;
    }

    if (actions.includes("replace")) {
      summary.replacements += 1;
    } else if (actions.includes("create")) {
      summary.creates += 1;
    } else if (actions.includes("update")) {
      summary.updates += 1;
    } else if (actions.includes("delete")) {
      summary.deletes += 1;
    }

    const address = stringValue(resourceChange.address, "unknown");
    const type = stringValue(resourceChange.type, "unknown");
    const name = stringValue(
      resourceChange.name,
      resourceNameFromAddress(address),
    );
    const terraformChange = recordValue(resourceChange.change);
    const riskFlags = getRiskFlags(resourceChange, terraformChange);

    if (riskFlags.includes("iam_change")) {
      summary.iamChangeCount += 1;
    }

    if (riskFlags.includes("networking_change")) {
      summary.networkingChangeCount += 1;
    }

    if (riskFlags.includes("public_exposure")) {
      summary.publicExposureCount += 1;
    }

    if (riskFlags.length > 0) {
      summary.riskyResourceCount += 1;
    }

    const parsedChange: TerraformResourceChange = {
      id: `tf_change_${deploymentRunId}_${summary.resourceChanges.length}`,
      organizationId,
      terraformPlanId: planId,
      deploymentRunId,
      address,
      type,
      name,
      actions,
      providerName: stringValue(resourceChange.provider_name),
      moduleAddress: stringValue(resourceChange.module_address),
      riskFlags,
      evidencePath: `resource_changes[${index}]`,
      changeSummary: buildChangeSummary(type, address, actions, riskFlags),
    };

    summary.resourceChanges.push(parsedChange);
  });

  return summary;
}

function extractResourceChanges(plan: unknown): TerraformResourceChangeJson[] {
  const planRecord = recordValue(plan);
  const resourceChanges = planRecord?.resource_changes;

  if (!Array.isArray(resourceChanges)) {
    return [];
  }

  return resourceChanges
    .map((resourceChange) => recordValue(resourceChange))
    .filter((resourceChange): resourceChange is TerraformResourceChangeJson =>
      Boolean(resourceChange),
    );
}

function getTerraformActions(resourceChange: TerraformResourceChangeJson) {
  const change = recordValue(
    resourceChange.change,
  ) as TerraformChangeJson | null;

  return Array.isArray(change?.actions) ? change.actions : [];
}

function normalizeActions(actions: unknown[]): TerraformResourceAction[] {
  const actionSet = new Set(
    actions.map((action) =>
      action === "no-op" ? "no_op" : stringValue(action),
    ),
  );

  if (actionSet.has("create") && actionSet.has("delete")) {
    return ["replace"];
  }

  if (actionSet.has("replace")) {
    return ["replace"];
  }

  const normalizedActions: TerraformResourceAction[] = [];

  for (const action of ["create", "update", "delete", "no_op"] as const) {
    if (actionSet.has(action)) {
      normalizedActions.push(action);
    }
  }

  return normalizedActions;
}

function getRiskFlags(
  resourceChange: TerraformResourceChangeJson,
  change: Record<string, unknown> | null,
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const searchableResourceText = [
    resourceChange.address,
    resourceChange.type,
    resourceChange.name,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (isIamResource(searchableResourceText)) {
    flags.push("iam_change");
  }

  if (isNetworkingResource(searchableResourceText)) {
    flags.push("networking_change");
  }

  if (change && hasPublicExposure(change)) {
    flags.push("public_exposure");
  }

  return flags;
}

function isIamResource(value: string): boolean {
  return (
    value.includes("_iam_") ||
    value.includes(".iam_") ||
    value.includes("iam_policy") ||
    value.includes("iam_role") ||
    value.includes("iam_user") ||
    value.includes("iam_group") ||
    value.includes("identity_policy") ||
    value.includes("access_policy")
  );
}

function isNetworkingResource(value: string): boolean {
  return NETWORKING_MARKERS.some((marker) => value.includes(marker));
}

function hasPublicExposure(value: unknown): boolean {
  if (typeof value === "string") {
    return isPublicPolicyString(value) || PUBLIC_CIDR_VALUES.has(value.trim());
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasPublicExposure(item));
  }

  const record = recordValue(value);

  if (!record) {
    return false;
  }

  for (const [key, nestedValue] of Object.entries(record)) {
    if (isPublicExposureEntry(key, nestedValue)) {
      return true;
    }

    if (hasPublicExposure(nestedValue)) {
      return true;
    }
  }

  return false;
}

function isPublicExposureEntry(key: string, value: unknown): boolean {
  const normalizedKey = key.toLowerCase();

  if (
    (normalizedKey.endsWith("cidr_blocks") ||
      normalizedKey.endsWith("cidr_block")) &&
    containsPublicCidr(value)
  ) {
    return true;
  }

  if (normalizedKey === "publicly_accessible" && value === true) {
    return true;
  }

  if (PUBLIC_ACCESS_BLOCK_KEYS.has(normalizedKey) && value === false) {
    return true;
  }

  return (
    (normalizedKey === "policy" || normalizedKey.endsWith("_policy")) &&
    typeof value === "string" &&
    isPublicPolicyString(value)
  );
}

function containsPublicCidr(value: unknown): boolean {
  if (typeof value === "string") {
    return PUBLIC_CIDR_VALUES.has(value.trim());
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsPublicCidr(item));
  }

  return false;
}

function isPublicPolicyString(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return false;
  }

  try {
    return hasPublicAllowStatement(JSON.parse(trimmed));
  } catch {
    return false;
  }
}

function hasPublicAllowStatement(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasPublicAllowStatement(item));
  }

  const record = recordValue(value);

  if (!record) {
    return false;
  }

  const effect = stringValue(record.Effect ?? record.effect);
  const principal = record.Principal ?? record.principal;

  if (effect?.toLowerCase() === "allow" && isPublicPrincipal(principal)) {
    return true;
  }

  return Object.values(record).some((item) => hasPublicAllowStatement(item));
}

function isPublicPrincipal(value: unknown): boolean {
  if (value === "*") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => isPublicPrincipal(item));
  }

  const record = recordValue(value);

  if (!record) {
    return false;
  }

  return Object.values(record).some((item) => isPublicPrincipal(item));
}

function buildChangeSummary(
  type: string,
  address: string,
  actions: TerraformResourceAction[],
  riskFlags: RiskFlag[],
): string {
  const actionSummary = actions.join(", ");
  const riskSummary =
    riskFlags.length > 0 ? ` with ${riskFlags.join(", ")}` : "";

  return `${type} ${address} will ${actionSummary}${riskSummary}`;
}

function resourceNameFromAddress(address: string): string {
  const parts = address.split(".");

  return parts.at(-1) ?? "unknown";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | undefined;
function stringValue(value: unknown, fallback: string): string;
function stringValue(value: unknown, fallback?: string): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
