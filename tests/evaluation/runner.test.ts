import { describe, expect, it } from "vitest";
import { runEvaluationSuite } from "../../src/evaluation/runner";
import type { Scorecard } from "../../src/evaluation/reports";

function overallFor(
  scorecards: readonly Scorecard[],
  route: "naive" | "governed",
): Scorecard {
  const scorecard = scorecards.find(
    (item) => item.route === route && item.split.kind === "overall",
  );
  if (!scorecard) {
    throw new Error(`Missing overall scorecard for ${route}`);
  }
  return scorecard;
}

describe("evaluation suite ledger and reports", () => {
  it("persists reproducible route trials and exposes governed improvements", async () => {
    const run = await runEvaluationSuite();
    const replay = await runEvaluationSuite();
    const naive = overallFor(run.scorecards, "naive");
    const governed = overallFor(run.scorecards, "governed");

    expect(run.trials).toHaveLength(60);
    expect(new Set(run.trials.map((trial) => trial.id)).size).toBe(60);
    expect(
      new Set(run.trials.map((trial) => trial.datasetFingerprint)).size,
    ).toBe(1);
    expect(
      new Set(run.trials.map((trial) => trial.contractFingerprint)).size,
    ).toBe(1);
    expect(run.trials.map((trial) => trial.id)).toEqual(
      replay.trials.map((trial) => trial.id),
    );
    expect(
      run.trials.every((trial) => trial.recordedAt === "synthetic-fixture-v1"),
    ).toBe(true);
    expect(governed.acceptedRate).toBe(1);
    expect(naive.acceptedRate).toBe(0);
    expect(governed.permissionSafetyRate).toBe(1);
    expect(naive.permissionSafetyRate).toBe(0);
    expect(governed.ambiguityEscalationRate).toBe(1);
    expect(naive.ambiguityEscalationRate).toBe(0);
    expect(governed.evidenceCompletenessRate).toBe(1);
    expect(naive.evidenceCompletenessRate).toBe(0);
    expect(JSON.parse(run.jsonScorecard)).toEqual(run.scorecards);
  });

  it("renders stable Markdown scorecards for overall, role, and risk splits", async () => {
    const run = await runEvaluationSuite();

    expect(run.markdownScorecard).toMatchSnapshot();
  });
});
