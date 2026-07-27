import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173";
const outputPath = resolve(process.argv[3] ?? "../../docs/assets/causescope-inspector.png");

mkdirSync(dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  colorScheme: "dark",
  deviceScaleFactor: 1,
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();

try {
  await page.goto(`${baseUrl}/refund`, { waitUntil: "networkidle" });
  const refundButton = page.getByRole("button", { name: "Refund order" });
  await refundButton.waitFor();
  await page.getByRole("button", { name: /Inspect/ }).click();
  await refundButton.hover();
  await page.locator(".cs-highlight-label").waitFor();
  await refundButton.click({ force: true });
  await page.getByRole("tab", { name: "Why", exact: true }).waitFor();

  const drawer = page.getByRole("complementary", { name: "CauseScope inspector" });
  const resizer = drawer.getByRole("button", { name: "Resize CauseScope inspector" });
  await resizer.focus();
  for (let index = 0; index < 10; index += 1) await resizer.press("ArrowLeft");
  await drawer.getByText('order.status === "paid"', { exact: true }).scrollIntoViewIfNeeded();

  await page.screenshot({
    animations: "disabled",
    path: outputPath,
  });
} finally {
  await context.close();
  await browser.close();
}

console.log(`Saved CauseScope inspector screenshot to ${outputPath}`);
