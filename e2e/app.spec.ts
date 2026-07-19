import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("filters task reviews and exposes governed evidence details", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Semantic Contract Eval Studio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Task reviews" }),
  ).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByLabel("Role").selectOption("finance");
  await expect(page.getByText("5 task reviews")).toBeVisible();
  await page
    .getByRole("button", { name: "Review eval.finance_active_customer_count" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Evidence packet" }),
  ).toBeVisible();
  await expect(page.getByText("finance.active_customer v2")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Grader decisions" }),
  ).toBeVisible();
  await page.getByLabel("Role").selectOption("all");
  await page.getByLabel("Capability").selectOption("permission");
  await page
    .getByRole("button", { name: "Review eval.permission_support_arr" })
    .click();
  await expect(page.getByText("PERMISSION_DENIED")).toBeVisible();
  await expect(page.getByText("No query was authorized.")).toBeVisible();
});
