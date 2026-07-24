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
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const title = page.getByRole("textbox", { name: "Title" });
  await title.click();
  await title.fill("");
  await title.pressSequentially("CauseScope Launch Mug", { delay: 55 });
  await page.waitForTimeout(800);

  await page.getByRole("button", { name: /Inspect/ }).click();
  await page.waitForTimeout(450);
  await page.getByText("Changes ready", { exact: true }).click();
  await page.waitForTimeout(2_600);

  const stateTab = page.getByRole("tab", { name: "State", exact: true });
  await stateTab.click();
  await page.waitForTimeout(2_200);

  await page.getByRole("tab", { name: "Why", exact: true }).click();
  await page.waitForTimeout(1_400);
} finally {
  const saveRecording = video.saveAs(outputPath);
  await context.close();
  await saveRecording;
  await browser.close();
  rmSync(recordingDirectory, { recursive: true, force: true });
}

console.log(`Saved CauseScope demo recording to ${outputPath}`);
