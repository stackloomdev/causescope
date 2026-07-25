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
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const title = page.getByRole("textbox", { name: "Title" });
  await title.fill("CauseScope Launch Mug");
  await page.getByRole("button", { name: /Inspect/ }).click();
  await page.getByText("Changes ready", { exact: true }).click();
  await page.getByRole("tab", { name: "Why", exact: true }).waitFor();

  await page.screenshot({
    animations: "disabled",
    path: outputPath,
  });
} finally {
  await context.close();
  await browser.close();
}

console.log(`Saved CauseScope inspector screenshot to ${outputPath}`);
