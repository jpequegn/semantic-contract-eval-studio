import { expect, test } from "@playwright/test";

test("renders the semantic evaluation workspace shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Semantic Contract Eval Studio" }),
  ).toBeVisible();
  await expect(
    page.getByText("Make business meaning and permissions testable."),
  ).toBeVisible();
  await expect(page.getByText("Local fixture")).toBeVisible();
});
