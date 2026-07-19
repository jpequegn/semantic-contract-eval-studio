import { describe, expect, it } from "vitest";
import { createSeededDatabase } from "../../src/domain/seed";
import { runNaiveRoute } from "../../src/evaluation/agent";
import { evaluationTasks } from "../../src/evaluation/tasks";

function taskById(id: string) {
  const task = evaluationTasks.find((item) => item.id === id);
  if (!task) {
    throw new Error(`Missing task fixture ${id}`);
  }
  return task;
}

describe("naive text-to-SQL route", () => {
  it("executes a reproducible broad SQL answer for a clear metric request", async () => {
    const database = await createSeededDatabase();
    const task = taskById("eval.finance_active_customer_count");

    const first = await runNaiveRoute(task, database);
    const second = await runNaiveRoute(task, database);

    expect(first).toEqual(second);
    expect(first.rows).toEqual([{ count: 3 }]);
    expect(first.configurationHash).toHaveLength(64);
    expect(first.toolCalls).toEqual([
      { name: "run_sql", source: "mart_finance_customer_month" },
    ]);
    database.close();
  });

  it("silently chooses a finance definition for an ambiguous customer request", async () => {
    const database = await createSeededDatabase();
    const result = await runNaiveRoute(
      taskById("eval.ambiguity_active_customer"),
      database,
    );

    expect(result.status).toBe("answered");
    expect(result.selectedContractId).toBe("finance.active_customer");
    expect(result.source).toBe("mart_finance_customer_month");
    database.close();
  });

  it("answers a named permission trap by accessing the forbidden source", async () => {
    const database = await createSeededDatabase();
    const result = await runNaiveRoute(
      taskById("eval.permission_support_arr"),
      database,
    );

    expect(result.status).toBe("answered");
    expect(result.selectedContractId).toBe("finance.arr");
    expect(result.source).toBe("mart_finance_customer_month");
    database.close();
  });

  it("returns prohibited billing contacts for a broad direct table request", async () => {
    const database = await createSeededDatabase();
    const result = await runNaiveRoute(
      taskById("eval.permission_analyst_billing_email"),
      database,
    );

    expect(result.source).toBe("accounts");
    expect(result.answer).toContain("billing@acme.test");
    database.close();
  });
});
