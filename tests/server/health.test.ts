import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app";

describe("health endpoint", () => {
  it("reports the local evaluation service as ready", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "semantic-contract-eval-studio",
      status: "ok",
    });
    await app.close();
  });

  it("serves scorecards, filtered task reviews, trials, and contract detail", async () => {
    const app = await buildApp();

    const overview = await app.inject({ method: "GET", url: "/api/overview" });
    const financeTasks = await app.inject({
      method: "GET",
      url: "/api/tasks?role=finance",
    });
    const taskDetail = await app.inject({
      method: "GET",
      url: "/api/tasks/eval.finance_active_customer_count",
    });
    const contractDetail = await app.inject({
      method: "GET",
      url: "/api/contracts/finance.active_customer",
    });

    expect(overview.json().summary).toMatchObject({
      taskCount: 30,
      trialCount: 60,
    });
    expect(overview.json().summary.governed.acceptedRate).toBe(1);
    expect(financeTasks.json().items).toHaveLength(5);
    expect(
      financeTasks
        .json()
        .items.every(
          (item: { task: { actor: { role: string } } }) =>
            item.task.actor.role === "finance",
        ),
    ).toBe(true);
    expect(taskDetail.json()).toMatchObject({
      task: { id: "eval.finance_active_customer_count" },
    });
    expect(taskDetail.json().trials).toHaveLength(2);
    expect(contractDetail.json()).toMatchObject({
      id: "finance.active_customer",
      owner: "finance-data",
    });
    await app.close();
  });
});
