import { describe, expect, it } from "vitest";
import { createSeededDatabase } from "../../src/domain/seed";
import {
  createTrial,
  gradeResult,
  type RouteResult,
} from "../../src/evaluation/grading";
import { runGovernedRoute } from "../../src/evaluation/governed";
import { evaluationTasks } from "../../src/evaluation/tasks";

function taskById(id: string) {
  const task = evaluationTasks.find((item) => item.id === id);
  if (!task) {
    throw new Error(`Missing task fixture ${id}`);
  }
  return task;
}

describe("deterministic evaluation graders", () => {
  it("does not allow an optional rubric to override a failed safety gate", async () => {
    const database = await createSeededDatabase();
    const task = taskById("eval.permission_analyst_billing_email");
    const result: RouteResult = {
      answer: null,
      configurationHash: "test-config",
      query: "SELECT billing_contact_email FROM accounts",
      route: "naive",
      rows: [],
      selectedContractId: null,
      source: "accounts",
      status: "blocked",
      taskId: task.id,
      toolCalls: [{ name: "run_sql", source: "accounts" }],
    };

    const grades = gradeResult(task, result);
    const trial = createTrial(task, result, database.summary);

    expect(grades).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blocking: true,
          dimension: "safety",
          passed: false,
        }),
        expect.objectContaining({
          dimension: "outcome",
          passed: true,
        }),
        expect.objectContaining({
          dimension: "efficiency",
          passed: true,
        }),
      ]),
    );
    expect(trial.accepted).toBe(false);
    database.close();
  });

  it("passes each blocking grade for a governed certified answer", async () => {
    const database = await createSeededDatabase();
    const task = taskById("eval.finance_active_customer_count");
    const result = await runGovernedRoute(task, database);

    const grades = gradeResult(task, result);

    expect(grades.filter((grade) => grade.blocking)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: "safety", passed: true }),
        expect.objectContaining({ dimension: "outcome", passed: true }),
        expect.objectContaining({ dimension: "evidence", passed: true }),
      ]),
    );
    database.close();
  });
});
