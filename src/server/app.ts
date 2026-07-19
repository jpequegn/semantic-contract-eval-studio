import cors from "@fastify/cors";
import Fastify from "fastify";
import { semanticContracts, type Role } from "../domain/contracts";
import {
  analyzeDefinitionChange,
  semanticDefinitionChanges,
} from "../evaluation/change-impact";
import type { PersistedTrial } from "../evaluation/ledger";
import type { Scorecard } from "../evaluation/reports";
import { runEvaluationSuite } from "../evaluation/runner";
import { evaluationTasks, type EvaluationTask } from "../evaluation/tasks";

export interface TaskReview {
  readonly task: EvaluationTask;
  readonly trials: readonly PersistedTrial[];
}

export interface StudioData {
  readonly scorecards: readonly Scorecard[];
  readonly taskReviews: readonly TaskReview[];
  readonly trials: readonly PersistedTrial[];
}

interface TaskQuery {
  readonly capability?: EvaluationTask["capability"];
  readonly risk?: EvaluationTask["risk"];
  readonly role?: Role;
}

interface TaskParams {
  readonly taskId: string;
}

function reviewsFor(trials: readonly PersistedTrial[]): readonly TaskReview[] {
  return evaluationTasks.map((task) => ({
    task,
    trials: trials.filter((trial) => trial.task.id === task.id),
  }));
}

function taskMatches(task: EvaluationTask, query: TaskQuery): boolean {
  return (
    (!query.role || task.actor.role === query.role) &&
    (!query.risk || task.risk === query.risk) &&
    (!query.capability || task.capability === query.capability)
  );
}

export async function createStudioData(): Promise<StudioData> {
  const run = await runEvaluationSuite();
  return {
    scorecards: run.scorecards,
    taskReviews: reviewsFor(run.trials),
    trials: run.trials,
  };
}

export async function buildApp(studioData?: StudioData) {
  const data = studioData ?? (await createStudioData());
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: false });

  app.get("/api/health", async () => ({
    service: "semantic-contract-eval-studio",
    status: "ok",
  }));

  app.get("/api/overview", async () => {
    const overall = data.scorecards.filter(
      (scorecard) => scorecard.split.kind === "overall",
    );
    return {
      scorecards: data.scorecards,
      summary: {
        governed: overall.find((scorecard) => scorecard.route === "governed"),
        naive: overall.find((scorecard) => scorecard.route === "naive"),
        taskCount: data.taskReviews.length,
        trialCount: data.trials.length,
      },
    };
  });

  app.get<{ Querystring: TaskQuery }>("/api/tasks", async (request) => ({
    items: data.taskReviews.filter((review) =>
      taskMatches(review.task, request.query),
    ),
  }));

  app.get<{ Params: TaskParams }>(
    "/api/tasks/:taskId",
    async (request, reply) => {
      const review = data.taskReviews.find(
        (item) => item.task.id === request.params.taskId,
      );
      if (!review) {
        return reply.code(404).send({ error: "Task not found." });
      }
      return {
        contracts: semanticContracts.filter((contract) =>
          [
            review.task.expected.contractId,
            ...review.task.expected.candidateContractIds,
          ].includes(contract.id),
        ),
        ...review,
      };
    },
  );

  app.get<{ Querystring: TaskQuery }>("/api/trials", async (request) => ({
    items: data.trials.filter((trial) =>
      taskMatches(trial.task, request.query),
    ),
  }));

  app.get("/api/scorecards", async () => ({
    items: data.scorecards,
  }));

  app.get("/api/contracts", async () => ({ items: semanticContracts }));

  app.get<{ Params: { contractId: string } }>(
    "/api/change-impact/:contractId",
    async (request, reply) => {
      const change = semanticDefinitionChanges.find(
        (item) => item.contractId === request.params.contractId,
      );
      if (!change) {
        return reply.code(404).send({ error: "Change fixture not found." });
      }
      return analyzeDefinitionChange(change);
    },
  );

  app.get<{ Params: { contractId: string } }>(
    "/api/contracts/:contractId",
    async (request, reply) => {
      const contract = semanticContracts.find(
        (item) => item.id === request.params.contractId,
      );
      if (!contract) {
        return reply.code(404).send({ error: "Contract not found." });
      }
      return contract;
    },
  );

  return app;
}
