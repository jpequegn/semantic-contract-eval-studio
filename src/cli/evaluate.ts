import { runEvaluationSuite } from "../evaluation/runner";

const run = await runEvaluationSuite();
process.stdout.write(run.markdownScorecard);
process.stdout.write("\n");
process.stdout.write(run.jsonScorecard);
