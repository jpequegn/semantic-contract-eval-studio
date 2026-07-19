import { describe, expect, it } from "vitest";
import {
  assertValidCorpus,
  corpusSummary,
  evaluationTasks,
  lintTasks,
  summarizeCorpus,
} from "../../src/evaluation/tasks";

describe("versioned evaluation task corpus", () => {
  it("contains the required balanced task categories", () => {
    expect(corpusSummary).toMatchObject({
      categoryCounts: {
        ambiguity: 8,
        clear_success: 10,
        conflicting_source: 3,
        permission_trap: 6,
        stale_data: 3,
      },
      taskCount: 30,
    });
    expect(corpusSummary.fingerprint).toHaveLength(64);
    expect(() => assertValidCorpus()).not.toThrow();
  });

  it("keeps every shipped task lint-clean", () => {
    expect(lintTasks(evaluationTasks)).toEqual([]);
  });

  it("flags undeclared expectations and invalid contract references", () => {
    const validTask = evaluationTasks.at(0);
    if (!validTask) {
      throw new Error("Expected the shipped corpus to contain a task.");
    }
    const invalidTask = {
      ...validTask,
      expected: {
        ...validTask.expected,
        contractId: "missing.contract",
        requiredEvidence: ["metric_id"],
        resultInvariant: undefined,
      },
      id: "eval.invalid_task",
    };

    const diagnostics = lintTasks([invalidTask]);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "missing-answer-expectation",
      "missing-evidence-expectation",
      "missing-evidence-expectation",
      "missing-evidence-expectation",
      "missing-evidence-expectation",
      "missing-evidence-expectation",
      "unknown-contract",
    ]);
  });

  it("produces a stable fingerprint for an unchanged corpus", () => {
    expect(summarizeCorpus(evaluationTasks)).toEqual(corpusSummary);
  });
});
