import { describe, expect, it } from "vitest";
import { createSeededDatabase } from "../../src/domain/seed";
import {
  canReadColumn,
  canRoleAccessContract,
  runGovernedRoute,
} from "../../src/evaluation/governed";
import { evaluationTasks } from "../../src/evaluation/tasks";
import { semanticContracts } from "../../src/domain/contracts";

function taskById(id: string) {
  const task = evaluationTasks.find((item) => item.id === id);
  if (!task) {
    throw new Error(`Missing task fixture ${id}`);
  }
  return task;
}

describe("governed semantic-contract route", () => {
  it("returns certified results with a complete evidence packet", async () => {
    const database = await createSeededDatabase();
    const task = taskById("eval.finance_active_customer_count");

    const result = await runGovernedRoute(task, database);

    expect(result.status).toBe("answered");
    expect(result.rows).toEqual([{ count: 3 }]);
    expect(result.evidence).toMatchObject({
      metricId: "finance.active_customer",
      owner: "finance-data",
      source: "mart_finance_customer_month",
      version: 2,
    });
    expect(result.evidence?.queryHash).toHaveLength(64);
    expect(result.toolCalls.map((call) => call.name)).toEqual([
      "resolve_metric",
      "get_owner",
      "run_certified_query",
    ]);
    database.close();
  });

  it("blocks a permission trap before any certified query runs", async () => {
    const database = await createSeededDatabase();
    const result = await runGovernedRoute(
      taskById("eval.permission_support_arr"),
      database,
    );

    expect(result.status).toBe("blocked");
    expect(result.query).toBeNull();
    expect(result.reasonCodes).toEqual(["PERMISSION_DENIED"]);
    expect(result.toolCalls).toEqual([{ name: "resolve_metric" }]);
    database.close();
  });

  it("escalates ambiguous definitions rather than choosing a source", async () => {
    const database = await createSeededDatabase();
    const result = await runGovernedRoute(
      taskById("eval.ambiguity_active_customer"),
      database,
    );

    expect(result.status).toBe("escalated");
    expect(result.query).toBeNull();
    expect(result.reasonCodes).toEqual(["SEMANTIC_CONFLICT"]);
    expect(result.toolCalls.map((call) => call.name)).toContain(
      "request_clarification",
    );
    database.close();
  });

  it("escalates stale source data and recognizes data-definition conflict", async () => {
    const database = await createSeededDatabase();
    const staleResult = await runGovernedRoute(
      taskById("eval.stale_product_workspace"),
      database,
    );
    const conflictResult = await runGovernedRoute(
      taskById("eval.conflict_blue_harbor"),
      database,
    );

    expect(staleResult.reasonCodes).toEqual(["FRESHNESS_SLA_EXCEEDED"]);
    expect(conflictResult.reasonCodes).toEqual(["SEMANTIC_CONFLICT"]);
    database.close();
  });

  it("keeps role and column policy checks deterministic", () => {
    const financeCustomer = semanticContracts.find(
      (contract) => contract.id === "finance.active_customer",
    );
    if (!financeCustomer) {
      throw new Error("Expected the finance customer contract.");
    }

    expect(canRoleAccessContract("finance", financeCustomer)).toBe(true);
    expect(canRoleAccessContract("support", financeCustomer)).toBe(false);
    expect(canReadColumn("billing_contact_email")).toBe(false);
  });
});
