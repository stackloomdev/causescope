import { expect, test } from "@playwright/test";

test("preserves CauseScope evidence through the React SWC transform", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle SWC tracing" }).click();
  await expect(page.getByRole("heading", { name: "SWC tracing enabled" })).toBeVisible();

  await page.getByRole("button", { name: /Inspect/ }).click();
  await page.getByRole("heading", { name: "SWC tracing enabled" }).click();

  const inspector = page.getByRole("complementary", { name: "CauseScope inspector" });
  await expect(inspector).toContainText("src/main.tsx:17");
  await expect(inspector).toContainText("SwcCompatibilityExample");
  await inspector.getByRole("tab", { name: "State" }).click();
  await expect(inspector).toContainText("enabled");
  await expect(inspector).toContainText("Current");
  await expect(inspector).toContainText("true");
  await expect(inspector).toContainText('click · button "Toggle SWC tracing"');
});
