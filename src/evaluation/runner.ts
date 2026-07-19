import { createSeededDatabase } from "../domain/seed";
import { type RouteName, runNaiveRoute } from "./agent";
import { createTrial, type EvaluationTrial, type RouteResult } from "./grading";
import { runGovernedRoute } from "./governed";
import { createTrialLedger, type PersistedTrial } from "./ledger";
import {
  buildScorecards,
  renderJsonScorecards,
  renderMarkdownScorecards,
  type Scorecard,
} from "./reports";
import { evaluationTasks, type EvaluationTask } from "./tasks";

export interface EvaluationRun {
  readonly jsonScorecard: string;
  readonly markdownScorecard: string;
  readonly scorecards: readonly Scorecard[];
  readonly trials: readonly PersistedTrial[];
}

async function executeRoute(
  route: RouteName,
  task: EvaluationTask,
  database: Awaited<ReturnType<typeof createSeededDatabase>>,
): Promise<RouteResult> {
  if (route === "governed") {
    return runGovernedRoute(task, database);
  }
  return runNaiveRoute(task, database);
}

export async function runEvaluationSuite(
  tasks: readonly EvaluationTask[] = evaluationTasks,
): Promise<EvaluationRun> {
  const database = await createSeededDatabase();
  try {
    const ledger = await createTrialLedger(database.connection);
    const transientTrials: EvaluationTrial[] = [];
    for (const task of tasks) {
      for (const route of ["naive", "governed"] as const) {
        const result = await executeRoute(route, task, database);
        const trial = createTrial(task, result, database.summary);
        transientTrials.push(trial);
        await ledger.record(trial);
      }
    }
    if (transientTrials.length !== tasks.length * 2) {
      throw new Error("Evaluation suite did not execute every task and route.");
    }
    const trials = await ledger.list();
    const scorecards = buildScorecards(trials);
    return {
      jsonScorecard: renderJsonScorecards(scorecards),
      markdownScorecard: renderMarkdownScorecards(scorecards),
      scorecards,
      trials,
    };
  } finally {
    database.close();
  }
}
