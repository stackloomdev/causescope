import { chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173";
const outputPath = resolve(process.argv[3] ?? "../../docs/assets/causescope-demo.webm");
const recordingDirectory = mkdtempSync(resolve(tmpdir(), "causescope-demo-"));
const recordingSize = { width: 1920, height: 1200 };

mkdirSync(dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  colorScheme: "dark",
  recordVideo: {
    dir: recordingDirectory,
    size: recordingSize,
  },
  viewport: recordingSize,
});
const page = await context.newPage();
const video = page.video();
if (!video) throw new Error("Playwright did not create a demo recording");

try {
  await page.goto(`${baseUrl}/refund`, { waitUntil: "networkidle" });
  const refundButton = page.getByRole("button", { name: "Refund order" });
  await refundButton.waitFor();

  await page.evaluate(() => {
    const host = document.getElementById("causescope-overlay-root");
    const root = host?.shadowRoot;
    if (!root) throw new Error("CauseScope overlay root is unavailable");

    const applyDemoWidth = (): void => {
      const drawer = root.querySelector<HTMLElement>(".cs-drawer");
      drawer?.style.setProperty("--cs-drawer-width", "640px", "important");
    };

    new MutationObserver(applyDemoWidth).observe(root, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
      subtree: true,
    });
    applyDemoWidth();
  });

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
  await content.evaluate(async (element) => {
    const startTop = element.scrollTop;
    const targetTop = Math.max(0, element.scrollHeight - element.clientHeight);
    const duration = 1_600;

    await new Promise<void>((resolveScroll) => {
      const startTime = performance.now();
      const animateScroll = (now: number): void => {
        const progress = Math.min(1, (now - startTime) / duration);
        const easedProgress = progress < 0.5
          ? 4 * progress ** 3
          : 1 - ((-2 * progress + 2) ** 3) / 2;
        element.scrollTop = startTop + (targetTop - startTop) * easedProgress;
        if (progress < 1) requestAnimationFrame(animateScroll);
        else resolveScroll();
      };
      requestAnimationFrame(animateScroll);
    });
  });
  await drawer.getByText("Response field", { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1_200);
} finally {
  const saveRecording = video.saveAs(outputPath);
  await context.close();
  await saveRecording;
  await browser.close();
  rmSync(recordingDirectory, { recursive: true, force: true });
}

console.log(`Saved CauseScope demo recording to ${outputPath}`);
