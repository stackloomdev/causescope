import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { TraceExport } from "causescope";

const EXPECTED_FIREFOX_VERSION = "153.0";

function inspector(page: Page): Locator {
  return page.getByRole("complementary", { name: "CauseScope inspector" });
}

async function beginInspect(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Inspect/ }).click();
}

test("selects ordinary text at its exact TypeScript source", async ({ browser, browserName, page }) => {
  expect(browserName).toBe("firefox");
  expect(browser.version()).toBe(EXPECTED_FIREFOX_VERSION);

  await page.goto("/orders");
  await beginInspect(page);
  await page.getByText("Fulfillment review", { exact: true }).click();

  const drawer = inspector(page);
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("src/pages/OrdersPage.tsx:30:13", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("tab")).toHaveCount(0);
});

test("preserves a real input-to-state transition", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Title").fill("Firefox traceable mug");
  await expect(page.getByText("Changes ready", { exact: true })).toBeVisible();

  await beginInspect(page);
  await page.getByText("Changes ready", { exact: true }).click();
  await inspector(page).getByRole("tab", { name: "State" }).click();

  const statePanel = inspector(page).getByRole("tabpanel");
  await expect(statePanel).toContainText("draft");
  await expect(statePanel).toContainText("Previous");
  await expect(statePanel).toContainText("Next");
  await expect(statePanel).toContainText("input · input → updateDraft");
  await expect(statePanel).toContainText("updateDraft · src/ProductEditor.tsx:58");
});

test("exports a structurally valid redacted trace", async ({ page }) => {
  await page.goto("/origins");
  await expect(page.getByRole("heading", { name: "Traceable ceramic mug" })).toBeVisible();

  await beginInspect(page);
  await page.getByRole("heading", { name: "Traceable ceramic mug" }).click();
  await inspector(page).getByRole("tab", { name: "Network" }).click();
  await expect(inspector(page).getByText("/api/products/42?token=%5BREDACTED%5D", { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await inspector(page).getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Firefox did not provide a path for the exported trace");

  const trace = JSON.parse(await readFile(downloadPath, "utf8")) as TraceExport;
  expect(trace.version).toBe(1);
  expect(Number.isNaN(Date.parse(trace.generatedAt))).toBe(false);
  expect(trace.element.tagName).toBe("h2");
  expect(trace.source).toMatchObject({
    file: "src/pages/DataOriginsPage.tsx",
    line: 92,
    column: 11,
  });
  expect(Array.isArray(trace.expressions)).toBe(true);
  expect(Array.isArray(trace.stateChanges)).toBe(true);
  expect(Array.isArray(trace.networkRequests)).toBe(true);
  expect(Array.isArray(trace.storageAccesses)).toBe(true);
  expect(Array.isArray(trace.storeUpdates)).toBe(true);
  expect(Array.isArray(trace.timeline)).toBe(true);

  const serializedTrace = JSON.stringify(trace);
  expect(serializedTrace).toContain("%5BREDACTED%5D");
  expect(serializedTrace).not.toContain("causescope-secret");
});
