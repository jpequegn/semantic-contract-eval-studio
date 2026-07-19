import { JSDuckDBValueConverter } from "@duckdb/node-api";
import { describe, expect, it } from "vitest";
import { createSeededDatabase } from "../../src/domain/seed";

describe("synthetic B2B SaaS fixture", () => {
  it("creates stable tables, row counts, and fingerprints", async () => {
    const first = await createSeededDatabase();
    const second = await createSeededDatabase();

    expect(first.summary.rowCounts).toEqual({
      accounts: 4,
      invoices: 4,
      mart_finance_customer_month: 4,
      mart_product_workspace_daily: 4,
      subscriptions: 4,
      support_risk_account: 4,
      support_tickets: 4,
      workspaces: 4,
    });
    expect(first.summary.dataFingerprint).toBe(second.summary.dataFingerprint);
    expect(first.summary.contractFingerprint).toBe(
      second.summary.contractFingerprint,
    );

    first.close();
    second.close();
  });

  it("preserves a genuine semantic conflict in the seeded data", async () => {
    const database = await createSeededDatabase();
    const reader = await database.connection.runAndReadAll(`
      SELECT finance.account_id
      FROM mart_finance_customer_month AS finance
      JOIN mart_product_workspace_daily AS product USING (account_id)
      WHERE finance.active_customer = false AND product.active_workspace_count > 0
    `);

    const rows = reader.convertRowObjects(JSDuckDBValueConverter);

    expect(rows).toEqual([{ account_id: 3 }]);
    database.close();
  });
});
