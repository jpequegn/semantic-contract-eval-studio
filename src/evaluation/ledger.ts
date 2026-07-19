import type { DuckDBConnection } from "@duckdb/node-api";
import type { EvaluationTrial, Grade, RouteResult } from "./grading";
import type { EvaluationTask } from "./tasks";

export interface PersistedTrial extends EvaluationTrial {
  readonly recordedAt: string;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Ledger field ${field} was not a string.`);
  }
  return value;
}

function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Ledger field ${field} was not a boolean.`);
  }
  return value;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== "number") {
    throw new Error(`Ledger field ${field} was not a number.`);
  }
  return value;
}

function parseJson<T>(value: unknown, field: string): T {
  return JSON.parse(asString(value, field)) as T;
}

export class TrialLedger {
  constructor(private readonly connection: DuckDBConnection) {}

  async record(trial: EvaluationTrial): Promise<void> {
    await this.connection.run(
      `INSERT OR REPLACE INTO evaluation_trial_ledger (
        trial_id, task_id, task_version, route, actor_role, category, risk,
        status, accepted, context_bytes, configuration_hash, contract_fingerprint,
        dataset_fingerprint, tool_schema_hash, grades_json, result_json, task_json,
        recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trial.id,
        trial.task.id,
        trial.task.version,
        trial.result.route,
        trial.task.actor.role,
        trial.task.category,
        trial.task.risk,
        trial.result.status,
        trial.accepted,
        trial.contextBytes,
        trial.configurationHash,
        trial.contractFingerprint,
        trial.datasetFingerprint,
        trial.toolSchemaHash,
        JSON.stringify(trial.grades),
        JSON.stringify(trial.result),
        JSON.stringify(trial.task),
        "synthetic-fixture-v1",
      ],
    );
  }

  async list(): Promise<readonly PersistedTrial[]> {
    const reader = await this.connection.runAndReadAll(
      `SELECT
        trial_id, accepted, context_bytes, configuration_hash,
        contract_fingerprint, dataset_fingerprint, tool_schema_hash,
        grades_json, result_json, task_json, recorded_at
      FROM evaluation_trial_ledger
      ORDER BY route, task_id`,
    );
    const rows = reader.getRowObjects();
    return rows.map((row) => ({
      accepted: asBoolean(row.accepted, "accepted"),
      configurationHash: asString(row.configuration_hash, "configuration_hash"),
      contextBytes: asNumber(row.context_bytes, "context_bytes"),
      contractFingerprint: asString(
        row.contract_fingerprint,
        "contract_fingerprint",
      ),
      datasetFingerprint: asString(
        row.dataset_fingerprint,
        "dataset_fingerprint",
      ),
      grades: parseJson<readonly Grade[]>(row.grades_json, "grades_json"),
      id: asString(row.trial_id, "trial_id"),
      recordedAt: asString(row.recorded_at, "recorded_at"),
      result: parseJson<RouteResult>(row.result_json, "result_json"),
      task: parseJson<EvaluationTask>(row.task_json, "task_json"),
      toolSchemaHash: asString(row.tool_schema_hash, "tool_schema_hash"),
    }));
  }
}

export async function createTrialLedger(
  connection: DuckDBConnection,
): Promise<TrialLedger> {
  await connection.run(`CREATE TABLE IF NOT EXISTS evaluation_trial_ledger (
    trial_id VARCHAR PRIMARY KEY,
    task_id VARCHAR NOT NULL,
    task_version INTEGER NOT NULL,
    route VARCHAR NOT NULL,
    actor_role VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    risk VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    accepted BOOLEAN NOT NULL,
    context_bytes INTEGER NOT NULL,
    configuration_hash VARCHAR NOT NULL,
    contract_fingerprint VARCHAR NOT NULL,
    dataset_fingerprint VARCHAR NOT NULL,
    tool_schema_hash VARCHAR NOT NULL,
    grades_json VARCHAR NOT NULL,
    result_json VARCHAR NOT NULL,
    task_json VARCHAR NOT NULL,
    recorded_at VARCHAR NOT NULL
  )`);
  return new TrialLedger(connection);
}
