import { createHash } from "node:crypto";
import { z } from "zod";

export const roleSchema = z.enum([
  "executive",
  "finance",
  "support",
  "sales",
  "analyst",
]);
export type Role = z.infer<typeof roleSchema>;

export const contractSchema = z.object({
  allowedRoles: z.array(roleSchema).min(1),
  businessDefinition: z.string().min(12),
  conflictsWith: z.array(z.string()),
  evidenceFields: z.array(z.string()).min(4),
  freshnessSlaHours: z.number().int().positive(),
  grain: z.string().min(1),
  id: z.string().regex(/^[a-z]+\.[a-z_]+$/),
  owner: z.string().min(1),
  resolver: z.string().min(1),
  source: z.string().min(1),
  timeSemantics: z.string().min(1),
  version: z.number().int().positive(),
});

export type SemanticContract = z.infer<typeof contractSchema>;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")} ]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export function compileContracts(
  rawContracts: readonly unknown[],
): readonly SemanticContract[] {
  const contracts = rawContracts.map((contract) =>
    contractSchema.parse(contract),
  );
  const ids = new Set<string>();

  for (const contract of contracts) {
    if (ids.has(contract.id)) {
      throw new Error(`Duplicate semantic contract id: ${contract.id}`);
    }
    ids.add(contract.id);
  }

  for (const contract of contracts) {
    for (const conflictId of contract.conflictsWith) {
      if (!ids.has(conflictId)) {
        throw new Error(
          `${contract.id} declares an unknown conflict: ${conflictId}`,
        );
      }
    }
  }

  return contracts;
}

export function visibleContracts(
  contracts: readonly SemanticContract[],
  role: Role,
): readonly SemanticContract[] {
  return contracts.filter((contract) => contract.allowedRoles.includes(role));
}

export const semanticContracts = compileContracts([
  {
    allowedRoles: ["finance", "executive"],
    businessDefinition:
      "Paying account with a non-canceled subscription at the end of the calendar month.",
    conflictsWith: ["product.active_workspace"],
    evidenceFields: [
      "metric_id",
      "version",
      "source",
      "as_of",
      "query_hash",
      "owner",
    ],
    freshnessSlaHours: 24,
    grain: "account_id",
    id: "finance.active_customer",
    owner: "finance-data",
    resolver: "sql/active_customer.sql",
    source: "mart_finance_customer_month",
    timeSemantics: "calendar_month_end",
    version: 2,
  },
  {
    allowedRoles: ["finance", "executive"],
    businessDefinition:
      "Annual recurring revenue from active subscriptions at calendar month end.",
    conflictsWith: [],
    evidenceFields: [
      "metric_id",
      "version",
      "source",
      "as_of",
      "query_hash",
      "owner",
    ],
    freshnessSlaHours: 24,
    grain: "account_id",
    id: "finance.arr",
    owner: "finance-data",
    resolver: "sql/arr.sql",
    source: "mart_finance_customer_month",
    timeSemantics: "calendar_month_end",
    version: 1,
  },
  {
    allowedRoles: ["executive", "analyst", "sales"],
    businessDefinition:
      "Account with at least one workspace that generated product activity in the last 30 days.",
    conflictsWith: ["finance.active_customer"],
    evidenceFields: [
      "metric_id",
      "version",
      "source",
      "as_of",
      "query_hash",
      "owner",
    ],
    freshnessSlaHours: 6,
    grain: "account_id",
    id: "product.active_workspace",
    owner: "product-analytics",
    resolver: "sql/active_workspace.sql",
    source: "mart_product_workspace_daily",
    timeSemantics: "rolling_30_days",
    version: 3,
  },
  {
    allowedRoles: ["support", "executive"],
    businessDefinition:
      "Account with a current high-severity support risk signal requiring named follow-up.",
    conflictsWith: [],
    evidenceFields: [
      "metric_id",
      "version",
      "source",
      "as_of",
      "query_hash",
      "owner",
    ],
    freshnessSlaHours: 12,
    grain: "account_id",
    id: "support.at_risk_customer",
    owner: "support-operations",
    resolver: "sql/at_risk_customer.sql",
    source: "support_risk_account",
    timeSemantics: "current_snapshot",
    version: 1,
  },
] satisfies readonly SemanticContract[]);

export const contractFingerprint = fingerprint(semanticContracts);
