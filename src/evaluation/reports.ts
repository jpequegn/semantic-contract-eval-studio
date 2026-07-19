import type { Role } from "../domain/contracts";
import type { RouteName } from "./agent";
import type { GradeDimension } from "./grading";
import type { PersistedTrial } from "./ledger";
import type { EvaluationTask } from "./tasks";

export type ScorecardSplit =
  | { readonly kind: "overall"; readonly value: "all" }
  | { readonly kind: "role"; readonly value: Role }
  | { readonly kind: "risk"; readonly value: EvaluationTask["risk"] };

export interface Scorecard {
  readonly acceptedRate: number;
  readonly ambiguityTaskCount: number;
  readonly ambiguityEscalationRate: number;
  readonly averageContextBytes: number;
  readonly averageToolCalls: number;
  readonly answerTaskCount: number;
  readonly evidenceCompletenessRate: number;
  readonly permissionTaskCount: number;
  readonly permissionSafetyRate: number;
  readonly route: RouteName;
  readonly split: ScorecardSplit;
  readonly totalTrials: number;
}

const roles: readonly Role[] = [
  "executive",
  "finance",
  "support",
  "sales",
  "analyst",
];
const risks: readonly EvaluationTask["risk"][] = ["high", "medium", "low"];
const routes: readonly RouteName[] = ["naive", "governed"];

function gradePassed(
  trial: PersistedTrial,
  dimension: GradeDimension,
): boolean {
  return (
    trial.grades.find((grade) => grade.dimension === dimension)?.passed ?? false
  );
}

function rate(
  trials: readonly PersistedTrial[],
  predicate: (trial: PersistedTrial) => boolean,
): number {
  if (trials.length === 0) {
    return 0;
  }
  return trials.filter(predicate).length / trials.length;
}

function subsetFor(
  trials: readonly PersistedTrial[],
  split: ScorecardSplit,
  route: RouteName,
): readonly PersistedTrial[] {
  return trials.filter((trial) => {
    if (trial.result.route !== route) {
      return false;
    }
    if (split.kind === "overall") {
      return true;
    }
    if (split.kind === "role") {
      return trial.task.actor.role === split.value;
    }
    return trial.task.risk === split.value;
  });
}

function scorecard(
  trials: readonly PersistedTrial[],
  split: ScorecardSplit,
  route: RouteName,
): Scorecard {
  const subset = subsetFor(trials, split, route);
  const average = (value: (trial: PersistedTrial) => number): number =>
    subset.length === 0
      ? 0
      : subset.reduce((sum, trial) => sum + value(trial), 0) / subset.length;
  const ambiguityTasks = subset.filter(
    (trial) => trial.task.category === "ambiguity",
  );
  const answerTasks = subset.filter(
    (trial) => trial.task.expected.outcome === "answer",
  );
  const permissionTasks = subset.filter(
    (trial) => trial.task.category === "permission_trap",
  );

  return {
    acceptedRate: rate(subset, (trial) => trial.accepted),
    ambiguityTaskCount: ambiguityTasks.length,
    ambiguityEscalationRate: rate(
      ambiguityTasks,
      (trial) =>
        trial.result.status === "escalated" && gradePassed(trial, "outcome"),
    ),
    averageContextBytes: average((trial) => trial.contextBytes),
    averageToolCalls: average((trial) => trial.result.toolCalls.length),
    answerTaskCount: answerTasks.length,
    evidenceCompletenessRate: rate(answerTasks, (trial) =>
      gradePassed(trial, "evidence"),
    ),
    permissionTaskCount: permissionTasks.length,
    permissionSafetyRate: rate(permissionTasks, (trial) =>
      gradePassed(trial, "safety"),
    ),
    route,
    split,
    totalTrials: subset.length,
  };
}

export function buildScorecards(
  trials: readonly PersistedTrial[],
): readonly Scorecard[] {
  const splits: readonly ScorecardSplit[] = [
    { kind: "overall", value: "all" },
    ...roles.map((value) => ({ kind: "role" as const, value })),
    ...risks.map((value) => ({ kind: "risk" as const, value })),
  ];
  return splits.flatMap((split) =>
    routes.map((route) => scorecard(trials, split, route)),
  );
}

function percentage(value: number, applicableCount: number): string {
  if (applicableCount === 0) {
    return "n/a";
  }
  return `${(value * 100).toFixed(0)}%`;
}

function renderTable(scorecards: readonly Scorecard[]): readonly string[] {
  return [
    "| Split | Route | Trials | Accepted | Permission safety | Ambiguity escalation | Evidence complete | Avg tools | Avg context bytes |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...scorecards.map(
      (card) =>
        `| ${card.split.value} | ${card.route} | ${card.totalTrials} | ${percentage(card.acceptedRate, card.totalTrials)} | ${percentage(card.permissionSafetyRate, card.permissionTaskCount)} | ${percentage(card.ambiguityEscalationRate, card.ambiguityTaskCount)} | ${percentage(card.evidenceCompletenessRate, card.answerTaskCount)} | ${card.averageToolCalls.toFixed(1)} | ${card.averageContextBytes.toFixed(0)} |`,
    ),
  ];
}

export function renderMarkdownScorecards(
  scorecards: readonly Scorecard[],
): string {
  const overall = scorecards.filter((card) => card.split.kind === "overall");
  const byRole = scorecards.filter((card) => card.split.kind === "role");
  const byRisk = scorecards.filter((card) => card.split.kind === "risk");
  return [
    "# Semantic Contract Evaluation Scorecard",
    "",
    "## Overall",
    ...renderTable(overall),
    "",
    "## By role",
    ...renderTable(byRole),
    "",
    "## By risk",
    ...renderTable(byRisk),
    "",
  ].join("\n");
}

export function renderJsonScorecards(scorecards: readonly Scorecard[]): string {
  return `${JSON.stringify(scorecards, null, 2)}\n`;
}
