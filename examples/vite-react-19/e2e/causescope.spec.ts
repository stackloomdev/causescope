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

async function focusWithKeyboard(page: Page, target: Locator, limit = 40): Promise<void> {
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element.matches(":focus"))) return;
  }
  throw new Error(`Keyboard focus did not reach ${await target.getAttribute("aria-label") ?? await target.textContent() ?? "target"}`);
}

async function setHmrFixture(page: Page, mode: "baseline" | "updated"): Promise<void> {
  const result = await page.evaluate(async (nextMode) => {
    const response = await fetch(`/__fixtures/hmr?mode=${nextMode}`, { method: "POST" });
    return { body: await response.text(), ok: response.ok };
  }, mode);
  expect(result.ok, result.body).toBe(true);
}

test("opens, navigates, and closes the inspector with keyboard input only", async ({ page }) => {
  await page.goto("/");

  const inspectButton = page.getByRole("button", { name: "Inspect", exact: true });
  await focusWithKeyboard(page, inspectButton);
  await expect(inspectButton).toBeFocused();
  await expect(inspectButton).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");

  const selectButton = page.getByRole("button", { name: /Select an element/ });
  await expect(selectButton).toHaveAttribute("aria-pressed", "true");
  const titleInput = page.getByLabel("Title");
  await focusWithKeyboard(page, titleInput);
  await expect(titleInput).toBeFocused();
  await page.keyboard.press("Enter");

  const drawer = inspector(page);
  await expect(drawer).toBeVisible();
  const tabPanel = drawer.getByRole("tabpanel");
  const views = [
    { name: "Why", heading: "Source" },
    { name: "Values", heading: "Values at render time" },
    { name: "State", heading: "Component state" },
    { name: "Network", heading: "Network origin" },
    { name: "Timeline", heading: "Render timeline" },
  ] as const;

  for (const [index, view] of views.entries()) {
    if (index > 0) await page.keyboard.press("ArrowRight");
    const activeTab = drawer.getByRole("tab", { name: view.name });
    await expect(activeTab).toBeFocused();
    await expect(activeTab).toHaveAttribute("aria-selected", "true");
    await expect(activeTab).toHaveCSS("outline-style", "solid");
    await expect(tabPanel).toHaveAttribute("aria-labelledby", `cs-tab-${view.name.toLowerCase()}`);
    await expect(tabPanel.getByRole("heading", { name: view.heading }).first()).toBeVisible();
  }

  await page.keyboard.press("Home");
  await expect(drawer.getByRole("tab", { name: "Why" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(drawer.getByRole("tab", { name: "Timeline" })).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(drawer).toBeHidden();
  await expect(inspectButton).toBeFocused();
  await expect(inspectButton).toHaveCSS("outline-style", "solid");
});

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

test("selects portal content and renders real CSS Module and Tailwind output", async ({ page }) => {
  await page.goto("/stability");

  const tailwindBadge = page.getByTestId("tailwind-badge");
  await expect(tailwindBadge).toHaveCSS("padding-left", "12px");
  await expect(tailwindBadge).toHaveCSS("font-weight", "600");
  await expect(page.getByTestId("css-module-card")).toHaveCSS("isolation", "isolate");

  await page.getByRole("button", { name: "Open portal fixture" }).click();
  const dialog = page.getByRole("dialog", { name: "Portal evidence outside the app root" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => document.querySelector("#root")?.contains(element) ?? true)).toBe(false);

  await beginInspect(page);
  await page.getByRole("heading", { name: "Portal evidence outside the app root" }).click();
  await expect(inspector(page)).toContainText("src/components/PortalPreview.tsx:19");
  await expect(inspector(page)).toContainText("PortalPreview");
  await expect(inspector(page).getByRole("tab")).toHaveCount(0);
});

test("keeps source ownership through Suspense retries and Error Boundary recovery", async ({ page }) => {
  await page.goto("/stability");
  await page.getByRole("button", { name: "Start suspense report" }).click();
  await expect(page.getByText("Suspense report loading", { exact: true })).toBeVisible();

  await beginInspect(page);
  await page.getByText("Suspense report loading", { exact: true }).click();
  await expect(inspector(page)).toContainText("src/pages/StabilityPage.tsx:62");

  await closeInspector(page);
  await page.getByRole("button", { name: "Resolve suspense report" }).click();
  await expect(page.getByRole("heading", { name: "Suspense report resolved" })).toBeVisible();
  await beginInspect(page);
  await page.getByRole("heading", { name: "Suspense report resolved" }).click();
  await expect(inspector(page)).toContainText("src/components/SuspenseReport.tsx:32");
  await expect(inspector(page)).toContainText("SuspenseReport");

  await closeInspector(page);
  await page.getByRole("button", { name: "Crash boundary child" }).click();
  await expect(page.getByRole("heading", { name: "Component failure contained" })).toBeVisible();
  await beginInspect(page);
  await page.getByRole("heading", { name: "Component failure contained" }).click();
  await expect(inspector(page)).toContainText("src/components/StabilityErrorBoundary.tsx:29");
  await expect(inspector(page)).toContainText("StabilityErrorBoundary");

  await closeInspector(page);
  await page.getByRole("button", { name: "Reset failed panel" }).click();
  await expect(page.getByRole("heading", { name: "Boundary child healthy" })).toBeVisible();
});

test("preserves hook state and source evidence across Vite Fast Refresh", async ({ page }) => {
  await page.goto("/stability");
  await expect(page.getByText("HMR baseline", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Increment refresh-safe count" }).click();
  await expect(page.getByRole("heading", { name: "Fast Refresh state: 1" })).toBeVisible();

  try {
    await setHmrFixture(page, "updated");
    await expect(page.getByText("HMR updated", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fast Refresh state: 1" })).toBeVisible();

    await beginInspect(page);
    await page.getByText("HMR updated", { exact: true }).click();
    await expect(inspector(page)).toContainText("src/components/HmrStatus.tsx:11");
    await expect(inspector(page)).toContainText("HmrStatus");
    await inspector(page).getByRole("tab", { name: "State" }).click();
    await expect(inspector(page)).toContainText("refreshCount");
    await expect(inspector(page)).toContainText("Current");
    await expect(inspector(page)).toContainText("1");
    await expect(inspector(page)).toContainText('click · button "Increment refresh-safe count"');
  } finally {
    await setHmrFixture(page, "baseline");
    await expect(page.getByText("HMR baseline", { exact: true })).toBeVisible();
  }
});
