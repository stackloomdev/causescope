import { chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173";
const outputPath = resolve(process.argv[3] ?? "../../docs/assets/causescope-demo.webm");
const recordingDirectory = mkdtempSync(resolve(tmpdir(), "causescope-demo-"));

mkdirSync(dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  colorScheme: "dark",
  recordVideo: {
    dir: recordingDirectory,
    size: { width: 1280, height: 800 },
  },
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
const video = page.video();
if (!video) throw new Error("Playwright did not create a demo recording");

try {
  await page.goto(`${baseUrl}/refund`, { waitUntil: "networkidle" });
  const refundButton = page.getByRole("button", { name: "Refund order" });
  await refundButton.waitFor();
  await page.waitForTimeout(550);
  await page.getByRole("button", { name: /Inspect/ }).click();
  await page.waitForTimeout(250);
  await refundButton.hover();
  await page.locator(".cs-highlight-label").waitFor();
  await page.waitForTimeout(250);
  await refundButton.click({ force: true });
  await page.waitForTimeout(700);

  const drawer = page.getByRole("complementary", { name: "CauseScope inspector" });
  const content = drawer.getByRole("tabpanel");
  await content.hover();
  for (const distance of [430, 500, 650]) {
    await page.mouse.wheel(0, distance);
    await page.waitForTimeout(650);
  }
  await drawer.getByRole("heading", { name: "Network response" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1_000);
} finally {
  const saveRecording = video.saveAs(outputPath);
  await context.close();
  await saveRecording;
  await browser.close();
  rmSync(recordingDirectory, { recursive: true, force: true });
}

console.log(`Saved CauseScope demo recording to ${outputPath}`);
