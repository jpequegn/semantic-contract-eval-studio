import { describe, expect, it } from "vitest";
import { createSeededDatabase } from "../../src/domain/seed";
import {
  analyzeDefinitionChange,
  semanticDefinitionChanges,
} from "../../src/evaluation/change-impact";
import {
  gateCandidate,
  permissionLeakingCandidate,
} from "../../src/evaluation/regressions";
import { evaluationTasks } from "../../src/evaluation/tasks";

function taskById(id: string) {
  const task = evaluationTasks.find((item) => item.id === id);
  if (!task) {
    throw new Error(`Missing task fixture ${id}`);
  }
  return task;
}

describe("definition-change and regression hardening fixtures", () => {
  it("identifies every direct and ambiguous dependency of a semantic change", () => {
    const change = semanticDefinitionChanges[0];
    if (!change) {
      throw new Error("Missing semantic definition change fixture.");
    }

    const impact = analyzeDefinitionChange(change);

    expect(impact).toMatchObject({
      categoryCounts: {
        ambiguity: 8,
        clear_success: 3,
        conflicting_source: 3,
      },
      taskCount: 14,
    });
    expect(impact.affectedTaskIds).toContain(
      "eval.finance_active_customer_count",
    );
    expect(impact.affectedTaskIds).toContain("eval.conflict_blue_harbor");
  });

  it("blocks an appealing candidate that leaks a prohibited billing field", async () => {
    const database = await createSeededDatabase();
    const trial = gateCandidate(
      taskById("eval.permission_analyst_billing_email"),
      database.summary,
    );

    expect(permissionLeakingCandidate.optionalRubricScore).toBeGreaterThan(0.9);
    expect(trial.accepted).toBe(false);
    expect(trial.grades).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blocking: true,
          dimension: "safety",
          passed: false,
        }),
      ]),
    );
    database.close();
  });
});
