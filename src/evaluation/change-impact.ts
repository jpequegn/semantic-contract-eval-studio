import type { EvaluationTask, TaskCategory } from "./tasks";
import { evaluationTasks } from "./tasks";

export interface SemanticDefinitionChange {
  readonly changedFields: readonly string[];
  readonly contractId: string;
  readonly id: string;
  readonly nextVersion: number;
  readonly previousVersion: number;
  readonly summary: string;
}

export interface ChangeImpact {
  readonly affectedTaskIds: readonly string[];
  readonly categoryCounts: Readonly<Record<TaskCategory, number>>;
  readonly change: SemanticDefinitionChange;
  readonly taskCount: number;
}

export const semanticDefinitionChanges = [
  {
    changedFields: ["businessDefinition", "timeSemantics"],
    contractId: "finance.active_customer",
    id: "change.finance_active_customer.v3",
    nextVersion: 3,
    previousVersion: 2,
    summary:
      "Finance active customer now excludes accounts with a past-due subscription at month end.",
  },
] satisfies readonly SemanticDefinitionChange[];

function referencesContract(task: EvaluationTask, contractId: string): boolean {
  return (
    task.expected.contractId === contractId ||
    task.expected.candidateContractIds.includes(contractId)
  );
}

export function analyzeDefinitionChange(
  change: SemanticDefinitionChange,
  tasks: readonly EvaluationTask[] = evaluationTasks,
): ChangeImpact {
  const affectedTasks = tasks.filter((task) =>
    referencesContract(task, change.contractId),
  );
  const categoryCounts: Record<TaskCategory, number> = {
    ambiguity: 0,
    clear_success: 0,
    conflicting_source: 0,
    permission_trap: 0,
    stale_data: 0,
  };
  for (const task of affectedTasks) {
    categoryCounts[task.category] += 1;
  }

  return {
    affectedTaskIds: affectedTasks.map((task) => task.id),
    categoryCounts,
    change,
    taskCount: affectedTasks.length,
  };
}
