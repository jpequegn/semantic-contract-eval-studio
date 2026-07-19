import {
  DuckDBConnection,
  DuckDBInstance,
  JSDuckDBValueConverter,
} from "@duckdb/node-api";
import { contractFingerprint, fingerprint } from "./contracts";

export type TableName =
  | "accounts"
  | "invoices"
  | "mart_finance_customer_month"
  | "mart_product_workspace_daily"
  | "subscriptions"
  | "support_risk_account"
  | "support_tickets"
  | "workspaces";

export interface SeedSummary {
  readonly contractFingerprint: string;
  readonly dataFingerprint: string;
  readonly rowCounts: Readonly<Record<TableName, number>>;
}

export interface SeededDatabase {
  readonly connection: DuckDBConnection;
  readonly instance: DuckDBInstance;
  readonly summary: SeedSummary;
  close(): void;
}

const schemaStatements = [
  `CREATE TABLE accounts (
    account_id INTEGER PRIMARY KEY,
    account_name VARCHAR NOT NULL,
    region VARCHAR NOT NULL,
    billing_contact_email VARCHAR NOT NULL
  )`,
  `CREATE TABLE subscriptions (
    subscription_id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL,
    plan_name VARCHAR NOT NULL,
    monthly_recurring_revenue INTEGER NOT NULL,
    status VARCHAR NOT NULL,
    canceled_at DATE
  )`,
  `CREATE TABLE invoices (
    invoice_id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL,
    invoice_month DATE NOT NULL,
    amount_cents INTEGER NOT NULL,
    payment_status VARCHAR NOT NULL
  )`,
  `CREATE TABLE workspaces (
    workspace_id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL,
    workspace_name VARCHAR NOT NULL,
    created_at DATE NOT NULL
  )`,
  `CREATE TABLE support_tickets (
    ticket_id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL,
    severity VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    opened_at TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE mart_finance_customer_month (
    account_id INTEGER PRIMARY KEY,
    month_end DATE NOT NULL,
    active_customer BOOLEAN NOT NULL,
    arr_cents INTEGER NOT NULL,
    as_of TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE mart_product_workspace_daily (
    account_id INTEGER PRIMARY KEY,
    activity_date DATE NOT NULL,
    active_workspace_count INTEGER NOT NULL,
    as_of TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE support_risk_account (
    account_id INTEGER PRIMARY KEY,
    risk_level VARCHAR NOT NULL,
    reason VARCHAR NOT NULL,
    as_of TIMESTAMP NOT NULL
  )`,
];

const seedStatements = [
  `INSERT INTO accounts VALUES
    (1, 'Acme Industrial', 'us-east', 'billing@acme.test'),
    (2, 'Northstar Labs', 'us-west', 'billing@northstar.test'),
    (3, 'Blue Harbor', 'eu-west', 'billing@blueharbor.test'),
    (4, 'Cedar Works', 'us-east', 'billing@cedar.test')`,
  `INSERT INTO subscriptions VALUES
    (100, 1, 'Enterprise', 120000, 'active', NULL),
    (101, 2, 'Growth', 45000, 'active', NULL),
    (102, 3, 'Starter', 12000, 'canceled', '2026-06-15'),
    (103, 4, 'Growth', 45000, 'past_due', NULL)`,
  `INSERT INTO invoices VALUES
    (200, 1, '2026-06-30', 120000, 'paid'),
    (201, 2, '2026-06-30', 45000, 'paid'),
    (202, 3, '2026-06-30', 12000, 'paid'),
    (203, 4, '2026-06-30', 45000, 'overdue')`,
  `INSERT INTO workspaces VALUES
    (300, 1, 'Acme Production', '2025-01-20'),
    (301, 2, 'Northstar Product', '2025-06-10'),
    (302, 3, 'Blue Harbor Sandbox', '2025-02-15'),
    (303, 4, 'Cedar Operations', '2025-10-11')`,
  `INSERT INTO support_tickets VALUES
    (400, 1, 'low', 'closed', '2026-06-15 08:00:00'),
    (401, 2, 'high', 'open', '2026-06-29 09:00:00'),
    (402, 3, 'medium', 'open', '2026-06-23 14:00:00'),
    (403, 4, 'high', 'open', '2026-06-28 12:00:00')`,
  `INSERT INTO mart_finance_customer_month VALUES
    (1, '2026-06-30', true, 1440000, '2026-07-01 06:00:00'),
    (2, '2026-06-30', true, 540000, '2026-07-01 06:00:00'),
    (3, '2026-06-30', false, 0, '2026-07-01 06:00:00'),
    (4, '2026-06-30', true, 540000, '2026-07-01 06:00:00')`,
  `INSERT INTO mart_product_workspace_daily VALUES
    (1, '2026-07-01', 1, '2026-07-01 08:00:00'),
    (2, '2026-07-01', 1, '2026-07-01 08:00:00'),
    (3, '2026-07-01', 1, '2026-07-01 08:00:00'),
    (4, '2026-07-01', 0, '2026-07-01 08:00:00')`,
  `INSERT INTO support_risk_account VALUES
    (1, 'low', 'No active service risk', '2026-07-01 07:00:00'),
    (2, 'high', 'Repeated integration failure', '2026-07-01 07:00:00'),
    (3, 'medium', 'Cancellation follow-up required', '2026-07-01 07:00:00'),
    (4, 'high', 'Payment escalation and open critical ticket', '2026-07-01 07:00:00')`,
];

const tableNames: readonly TableName[] = [
  "accounts",
  "invoices",
  "mart_finance_customer_month",
  "mart_product_workspace_daily",
  "subscriptions",
  "support_risk_account",
  "support_tickets",
  "workspaces",
];

async function countRows(
  connection: DuckDBConnection,
  table: TableName,
): Promise<number> {
  const reader = await connection.runAndReadAll(
    `SELECT CAST(COUNT(*) AS INTEGER) AS row_count FROM ${table}`,
  );
  const [row] = reader.convertRowObjects(JSDuckDBValueConverter);
  const value = row?.row_count;
  if (typeof value !== "number") {
    throw new Error(`Expected a numeric row count for ${table}`);
  }
  return value;
}

export async function createSeededDatabase(): Promise<SeededDatabase> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  for (const statement of schemaStatements) {
    await connection.run(statement);
  }
  for (const statement of seedStatements) {
    await connection.run(statement);
  }

  const rowCounts = Object.fromEntries(
    await Promise.all(
      tableNames.map(async (table) => [
        table,
        await countRows(connection, table),
      ]),
    ),
  ) as Record<TableName, number>;
  const summary = {
    contractFingerprint,
    dataFingerprint: fingerprint({ rowCounts, seedStatements }),
    rowCounts,
  } satisfies SeedSummary;

  return {
    connection,
    instance,
    summary,
    close() {
      connection.closeSync();
      instance.closeSync();
    },
  };
}
