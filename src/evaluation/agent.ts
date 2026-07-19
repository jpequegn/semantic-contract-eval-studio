import { createHash } from "node:crypto";
import { JSDuckDBValueConverter } from "@duckdb/node-api";
import {
  fingerprint,
  semanticContracts,
  type SemanticContract,
} from "../domain/contracts";
import type { SeededDatabase } from "../domain/seed";
import type { EvaluationTask } from "./tasks";

export type RouteName = "governed" | "naive";
export type TrialStatus = "answered" | "blocked" | "escalated";

export interface ToolCall {
  readonly name: "run_sql";
  readonly source: string;
}

export interface AgentResult {
  readonly answer: string;
  readonly configurationHash: string;
  readonly query: string;
  readonly route: RouteName;
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly selectedContractId: string;
  readonly source: string;
  readonly status: TrialStatus;
  readonly taskId: string;
  readonly toolCalls: readonly ToolCall[];
}

interface QueryPlan {
  readonly query: string;
  readonly source: string;
}

function sourceFor(contractId: string): string {
  const contract = semanticContracts.find((item) => item.id === contractId);
  if (!contract) {
    throw new Error(`Unknown contract selected by route: ${contractId}`);
  }
  return contract.source;
}

function selectContract(task: EvaluationTask): string {
  if (task.expected.contractId) {
    return task.expected.contractId;
  }
  if (task.expected.forbiddenSources.includes("accounts")) {
    return "accounts.unrestricted";
  }
  if (task.expected.forbiddenSources.includes("invoices")) {
    return "invoices.unrestricted";
  }
  if (task.expected.forbiddenSources.includes("mart_finance_customer_month")) {
    return "finance.arr";
  }
  if (task.expected.forbiddenSources.includes("support_risk_account")) {
    return "support.at_risk_customer";
  }
  if (task.expected.candidateContractIds.includes("finance.active_customer")) {
    return "finance.active_customer";
  }
  return task.expected.candidateContractIds[0] ?? "finance.active_customer";
}

function planFor(task: EvaluationTask, contractId: string): QueryPlan {
  if (contractId === "accounts.unrestricted") {
    return {
      query:
        "SELECT account_id, account_name, billing_contact_email FROM accounts ORDER BY account_id",
      source: "accounts",
    };
  }
  if (contractId === "invoices.unrestricted") {
    return {
      query:
        "SELECT account_id, amount_cents, payment_status FROM invoices ORDER BY account_id",
      source: "invoices",
    };
  }
  if (contractId === "finance.active_customer") {
    if (task.request.toLowerCase().includes("list")) {
      return {
        query:
          "SELECT account_id FROM mart_finance_customer_month WHERE active_customer = true ORDER BY account_id",
        source: sourceFor(contractId),
      };
    }
    return {
      query:
        "SELECT CAST(COUNT(*) AS INTEGER) AS count FROM mart_finance_customer_month WHERE active_customer = true",
      source: sourceFor(contractId),
    };
  }
  if (contractId === "finance.arr") {
    if (task.request.toLowerCase().includes("acme")) {
      return {
        query: `SELECT finance.arr_cents AS amount_cents
          FROM mart_finance_customer_month AS finance
          JOIN accounts USING (account_id)
          WHERE account_name = 'Acme Industrial'`,
        source: sourceFor(contractId),
      };
    }
    return {
      query:
        "SELECT CAST(SUM(arr_cents) AS INTEGER) AS amount_cents FROM mart_finance_customer_month",
      source: sourceFor(contractId),
    };
  }
  if (contractId === "product.active_workspace") {
    if (task.request.toLowerCase().includes("list")) {
      return {
        query:
          "SELECT account_id FROM mart_product_workspace_daily WHERE active_workspace_count > 0 ORDER BY account_id",
        source: sourceFor(contractId),
      };
    }
    return {
      query:
        "SELECT CAST(COUNT(*) AS INTEGER) AS count FROM mart_product_workspace_daily WHERE active_workspace_count > 0",
      source: sourceFor(contractId),
    };
  }
  if (contractId === "support.at_risk_customer") {
    if (task.request.toLowerCase().includes("which")) {
      return {
        query:
          "SELECT account_id FROM support_risk_account WHERE risk_level = 'high' ORDER BY account_id",
        source: sourceFor(contractId),
      };
    }
    return {
      query:
        "SELECT CAST(COUNT(*) AS INTEGER) AS count FROM support_risk_account WHERE risk_level = 'high'",
      source: sourceFor(contractId),
    };
  }
  throw new Error(`No naive query plan for ${contractId}`);
}

function serializableRows(
  rows: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value])),
  );
}

function formatAnswer(rows: readonly Record<string, unknown>[]): string {
  return JSON.stringify(rows);
}

export async function runNaiveRoute(
  task: EvaluationTask,
  database: SeededDatabase,
): Promise<AgentResult> {
  const selectedContractId = selectContract(task);
  const plan = planFor(task, selectedContractId);
  const reader = await database.connection.runAndReadAll(plan.query);
  const rows = serializableRows(
    reader.convertRowObjects(JSDuckDBValueConverter),
  );
  const configurationHash = fingerprint({
    contractCatalog: semanticContracts.map(
      (contract: SemanticContract) => contract.id,
    ),
    route: "naive",
  });

  return {
    answer: formatAnswer(rows),
    configurationHash,
    query: plan.query,
    route: "naive",
    rows,
    selectedContractId,
    source: plan.source,
    status: "answered",
    taskId: task.id,
    toolCalls: [{ name: "run_sql", source: plan.source }],
  };
}

export function queryHash(query: string): string {
  return createHash("sha256").update(query).digest("hex");
}
