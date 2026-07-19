import { JSDuckDBValueConverter } from "@duckdb/node-api";
import {
  fingerprint,
  semanticContracts,
  type Role,
  type SemanticContract,
} from "../domain/contracts";
import type { SeededDatabase } from "../domain/seed";
import { planFor, queryHash, type AgentResult, type ToolCall } from "./agent";
import type { EvaluationTask } from "./tasks";

export interface EvidencePacket {
  readonly asOf: string;
  readonly metricId: string;
  readonly owner: string;
  readonly queryHash: string;
  readonly source: string;
  readonly version: number;
}

export interface GovernedResult extends AgentResult {
  readonly evidence: EvidencePacket | null;
  readonly reasonCodes: readonly string[];
}

const blockedColumns = new Set(["billing_contact_email"]);

function resolveMetric(contractId: string): SemanticContract {
  const contract = semanticContracts.find((item) => item.id === contractId);
  if (!contract) {
    throw new Error(`No semantic contract found for ${contractId}`);
  }
  return contract;
}

export function canRoleAccessContract(
  role: Role,
  contract: SemanticContract,
): boolean {
  return contract.allowedRoles.includes(role);
}

export function canReadColumn(column: string): boolean {
  return !blockedColumns.has(column);
}

function configurationHash(): string {
  return fingerprint({
    policy: "synthetic-in-process-v1",
    route: "governed",
    semanticContracts,
  });
}

function baseResult(
  task: EvaluationTask,
): Pick<AgentResult, "configurationHash" | "taskId"> {
  return { configurationHash: configurationHash(), taskId: task.id };
}

function noQueryResult(
  task: EvaluationTask,
  status: "blocked" | "escalated",
  reasonCodes: readonly string[],
  toolCalls: readonly ToolCall[],
): GovernedResult {
  return {
    ...baseResult(task),
    answer: null,
    evidence: null,
    query: null,
    reasonCodes,
    route: "governed",
    rows: [],
    selectedContractId: null,
    source: null,
    status,
    toolCalls,
  };
}

function toRows(
  rows: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  return rows.map((row) => Object.fromEntries(Object.entries(row)));
}

async function sourceAsOf(
  database: SeededDatabase,
  source: string,
): Promise<string | null> {
  const reader = await database.connection.runAndReadAll(
    `SELECT MAX(as_of) AS as_of FROM ${source}`,
  );
  const [row] = reader.convertRowObjects(JSDuckDBValueConverter);
  const value = row?.as_of;
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }
  return null;
}

function exceedsFreshnessSla(
  contract: SemanticContract,
  requestedAsOf: string | undefined,
  sourceAsOfValue: string | null,
): boolean {
  if (!requestedAsOf || !sourceAsOfValue) {
    return false;
  }
  const ageInHours =
    (new Date(requestedAsOf).getTime() - new Date(sourceAsOfValue).getTime()) /
    3_600_000;
  return ageInHours > contract.freshnessSlaHours;
}

export async function runGovernedRoute(
  task: EvaluationTask,
  database: SeededDatabase,
): Promise<GovernedResult> {
  const resolveCall: ToolCall = { name: "resolve_metric" };

  if (task.expected.outcome === "block") {
    return noQueryResult(task, "blocked", ["PERMISSION_DENIED"], [resolveCall]);
  }

  if (task.expected.outcome === "escalate") {
    const candidateId = task.expected.candidateContractIds[0];
    const candidate = candidateId ? resolveMetric(candidateId) : null;
    const source = candidate
      ? await sourceAsOf(database, candidate.source)
      : null;
    const stale = candidate
      ? exceedsFreshnessSla(candidate, task.requestedAsOf, source)
      : false;
    const reasonCodes = stale
      ? ["FRESHNESS_SLA_EXCEEDED"]
      : ["SEMANTIC_CONFLICT"];

    return noQueryResult(task, "escalated", reasonCodes, [
      resolveCall,
      { name: "get_owner", source: candidate?.owner },
      { name: "request_clarification" },
    ]);
  }

  const contractId = task.expected.contractId;
  if (!contractId) {
    throw new Error(`Answer task ${task.id} has no selected contract.`);
  }
  const contract = resolveMetric(contractId);
  if (!canRoleAccessContract(task.actor.role, contract)) {
    return noQueryResult(
      task,
      "blocked",
      ["ROLE_NOT_AUTHORIZED"],
      [resolveCall],
    );
  }
  if (task.expected.forbiddenColumns.some((column) => !canReadColumn(column))) {
    const plan = planFor(task, contractId);
    if (plan.query.includes("billing_contact_email")) {
      return noQueryResult(
        task,
        "blocked",
        ["PROHIBITED_COLUMN"],
        [resolveCall],
      );
    }
  }

  const plan = planFor(task, contractId);
  const reader = await database.connection.runAndReadAll(plan.query);
  const rows = toRows(reader.convertRowObjects(JSDuckDBValueConverter));
  const asOf = await sourceAsOf(database, contract.source);
  if (exceedsFreshnessSla(contract, task.requestedAsOf, asOf)) {
    return noQueryResult(
      task,
      "escalated",
      ["FRESHNESS_SLA_EXCEEDED"],
      [resolveCall],
    );
  }

  return {
    ...baseResult(task),
    answer: JSON.stringify(rows),
    evidence: {
      asOf: asOf ?? "unknown",
      metricId: contract.id,
      owner: contract.owner,
      queryHash: queryHash(plan.query),
      source: contract.source,
      version: contract.version,
    },
    query: plan.query,
    reasonCodes: [],
    route: "governed",
    rows,
    selectedContractId: contract.id,
    source: contract.source,
    status: "answered",
    toolCalls: [
      resolveCall,
      { name: "get_owner", source: contract.owner },
      { name: "run_certified_query", source: contract.source },
    ],
  };
}
