import { expect, test } from "@playwright/test";

test("traces a React 18 state transition to its TypeScript source", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle tracing" }).click();
  await expect(page.getByRole("heading", { name: "Tracing enabled" })).toBeVisible();

  await page.getByRole("button", { name: /Inspect/ }).click();
  await page.getByRole("heading", { name: "Tracing enabled" }).click();

  const inspector = page.getByRole("complementary", { name: "CauseScope inspector" });
  await expect(inspector).toContainText("src/main.tsx:17");
  await inspector.getByRole("tab", { name: "State" }).click();
  await expect(inspector).toContainText("enabled");
  await expect(inspector).toContainText("Current");
  await expect(inspector).toContainText("true");
  await expect(inspector).toContainText('click · button "Toggle tracing"');
});
