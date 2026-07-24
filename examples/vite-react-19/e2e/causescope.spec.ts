import { expect, test, type Locator, type Page } from "@playwright/test";

function inspector(page: Page): Locator {
  return page.getByRole("complementary", { name: "CauseScope inspector" });
}

async function beginInspect(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Inspect/ }).click();
}

async function closeInspector(page: Page): Promise<void> {
  await inspector(page).getByRole("button", { name: "Close" }).click();
}

test("keeps state and values isolated across repeated order rows", async ({ page }) => {
  await page.goto("/orders");
  await page.getByRole("button", { name: "Priority only" }).click();
  await expect(page.getByText("2 visible orders", { exact: true })).toBeVisible();

  await beginInspect(page);
  await page.getByText("2 visible orders", { exact: true }).click();
  await inspector(page).getByRole("tab", { name: "State" }).click();
  await expect(inspector(page)).toContainText("priorityOnly");
  await expect(inspector(page)).toContainText("Current");
  await expect(inspector(page)).toContainText("true");
  await expect(inspector(page)).toContainText("click · button \"Priority only\"");

  // The drawer stays open: selecting another page element must immediately
  // replace the inspection without a secondary picker action.
  await page.getByText("Mina Park", { exact: true }).click();
  await inspector(page).getByRole("tab", { name: "Values" }).click();
  await expect(inspector(page)).toContainText("\"Mina Park\"");
  await expect(inspector(page)).toContainText("src/pages/OrdersPage.tsx:43:51");

  await page.getByText("Avery Chen", { exact: true }).click();
  await inspector(page).getByRole("tab", { name: "Values" }).click();
  await expect(inspector(page)).toContainText("\"Avery Chen\"");
  await expect(inspector(page)).not.toContainText("\"Mina Park\"");

  await page.getByText("Fulfillment review", { exact: true }).click();
  await expect(inspector(page)).toContainText("src/pages/OrdersPage.tsx:30");
  await expect(inspector(page).getByRole("tab")).toHaveCount(0);
});

test("links Fetch, XHR, React Query, Zustand, and Storage to rendered values", async ({ page }) => {
  await page.goto("/origins");
  await expect(page.getByRole("heading", { name: "Traceable ceramic mug" })).toBeVisible();

  await beginInspect(page);
  await page.getByRole("heading", { name: "Traceable ceramic mug" }).click();
  await inspector(page).getByRole("tab", { name: "Values" }).click();
  await expect(inspector(page)).toContainText("GET /api/products/42?token=%5BREDACTED%5D");
  await expect(inspector(page)).toContainText("response.data.product.name");
  await expect(inspector(page)).toContainText("React Query");
  await expect(inspector(page)).toContainText('["product","42"]');
  await expect(inspector(page)).toContainText("Updated at");
  await inspector(page).getByRole("tab", { name: "Network" }).click();
  await expect(inspector(page)).toContainText("FETCH");
  await expect(inspector(page)).toContainText("200");
  await expect(inspector(page)).toContainText("Response field");
  await expect(inspector(page)).toContainText("response.data.product.name");

  await page.getByText("USD 129", { exact: true }).click();
  await expect(inspector(page)).toContainText("Trace boundary");
  await expect(inspector(page)).toContainText("formatCurrency(product)");
  await expect(inspector(page)).toContainText("Internal function execution was not instrumented");

  await closeInspector(page);
  await page.getByRole("button", { name: "Load permissions" }).click();
  await expect(page.getByRole("heading", { name: "workspace-owner" })).toBeVisible();
  await beginInspect(page);
  await page.getByRole("heading", { name: "workspace-owner" }).click();
  await inspector(page).getByRole("tab", { name: "Values" }).click();
  await expect(inspector(page)).toContainText("GET /api/permissions");
  await expect(inspector(page)).toContainText("response.data.role");

  await closeInspector(page);
  await page.getByRole("button", { name: "Toggle density" }).click();
  await beginInspect(page);
  await page.getByRole("heading", { name: "Compact workspace" }).click();
  await inspector(page).getByRole("tab", { name: "Values" }).click();
  await expect(inspector(page)).toContainText("preferenceStore");
  await expect(inspector(page)).toContainText("state.compact");
  await expect(inspector(page)).toContainText("src/stores/preferences.ts:11:38");
  await inspector(page).getByRole("tab", { name: "Timeline" }).click();
  await expect(inspector(page)).toContainText("click button \"Toggle density\"");
  await expect(inspector(page)).toContainText("preferenceStore.setState(compact, density)");

  await closeInspector(page);
  await page.getByRole("button", { name: "Toggle stored theme" }).click();
  await beginInspect(page);
  await page.getByRole("heading", { name: "light theme" }).click();
  await inspector(page).getByRole("tab", { name: "Values" }).click();
  await expect(inspector(page)).toContainText("localStorage");
  await expect(inspector(page)).toContainText("causescope-theme");
  await inspector(page).getByRole("tab", { name: "Network" }).click();
  await expect(inspector(page)).toContainText("localStorage.getItem");

  await closeInspector(page);
  await page.getByRole("button", { name: "Toggle session workspace" }).click();
  await beginInspect(page);
  await page.getByRole("heading", { name: "secondary workspace" }).click();
  await inspector(page).getByRole("tab", { name: "Values" }).click();
  await expect(inspector(page)).toContainText("sessionStorage");
  await expect(inspector(page)).toContainText("causescope-workspace");
  await inspector(page).getByRole("tab", { name: "Network" }).click();
  await expect(inspector(page)).toContainText("sessionStorage.getItem");

  await closeInspector(page);
  await page.getByRole("button", { name: "Clear storage demo keys" }).click();
  await beginInspect(page);
  await page.getByRole("heading", { name: "dark theme" }).click();
  await inspector(page).getByRole("tab", { name: "Network" }).click();
  await expect(inspector(page)).toContainText("localStorage.removeItem");
  await page.getByRole("heading", { name: "primary workspace" }).click();
  await inspector(page).getByRole("tab", { name: "Network" }).click();
  await expect(inspector(page)).toContainText("sessionStorage.removeItem");
});

test("explains hidden branches and preserves the reducer-to-prop event chain", async ({ page }) => {
  await page.goto("/diagnostics");
  await beginInspect(page);
  await page.getByLabel("Conditional rendering stage").click();
  await expect(inspector(page)).toContainText("AdvancedPanel was not rendered");
  await expect(inspector(page)).toContainText("Not evaluated · short-circuit");
  await expect(inspector(page)).toContainText("Failed condition:");
  await expect(inspector(page)).toContainText("diagnostics.advanced");

  await closeInspector(page);
  await page.getByRole("button", { name: "Enable advanced" }).click();
  await page.getByRole("button", { name: "Grant permission" }).click();
  await page.getByRole("button", { name: "Increment reducer" }).click();
  await expect(page.getByText("Reducer count: 1", { exact: true })).toBeVisible();

  await beginInspect(page);
  await page.getByText("Reducer count: 1", { exact: true }).click();
  await inspector(page).getByRole("tab", { name: "Values" }).click();
  await expect(inspector(page)).toContainText("AdvancedPanel.props.count");
  await expect(inspector(page)).toContainText("src/pages/DiagnosticsPage.tsx:57:80");
  await expect(inspector(page)).toContainText("count=diagnostics.count");

  await inspector(page).getByRole("tab", { name: "State" }).click();
  await expect(inspector(page)).toContainText("ancestor · useReducer");
  await expect(inspector(page)).toContainText("click · button \"Increment reducer\"");
  await expect(inspector(page)).toContainText("Reducer action");

  await inspector(page).getByRole("tab", { name: "Timeline" }).click();
  await expect(inspector(page)).toContainText("click button \"Increment reducer\"");
  await expect(inspector(page)).toContainText("DiagnosticsPage rendered after diagnostics changed");
  await expect(inspector(page)).toContainText("children 0 → 1");
  await expect(inspector(page)).not.toContainText("onClick [function] → [function]");

  await inspector(page).getByRole("button", { name: "Copy Markdown" }).click();
  await expect(inspector(page).getByRole("status")).toHaveText("Markdown trace copied");

  const downloadPromise = page.waitForEvent("download");
  await inspector(page).getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^causescope-trace-\d+\.json$/);
});

test("links a native input event through the JSX handler to the state update", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Title").fill("Updated traceable mug");
  await expect(page.getByText("Changes ready", { exact: true })).toBeVisible();

  await beginInspect(page);
  await page.getByText("Changes ready", { exact: true }).click();
  await inspector(page).getByRole("tab", { name: "State" }).click();
  await expect(inspector(page)).toContainText("input · input → updateDraft");
  await expect(inspector(page)).toContainText("Handler");
  await expect(inspector(page)).toContainText("updateDraft · src/ProductEditor.tsx:58");

  await inspector(page).getByRole("tab", { name: "Timeline" }).click();
  await expect(inspector(page)).toContainText("input input → updateDraft");
});
