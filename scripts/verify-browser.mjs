import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8787";
const screenshotPath = path.resolve("logs", "browser-verify.png");
const consoleErrors = [];

await fs.mkdir(path.dirname(screenshotPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true
});

page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => {
  consoleErrors.push(error.message);
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 15_000 });

  const bodyText = (await page.locator("body").innerText({ timeout: 5_000 })).trim();
  if (bodyText.length < 20) {
    throw new Error("Page body is unexpectedly empty.");
  }

  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForFunction(
    () => document.querySelector(".xterm-screen")?.textContent?.includes("Mock Codex CLI ready"),
    undefined,
    { timeout: 10_000 }
  );

  await page.getByPlaceholder("휴대폰 키보드 입력").fill("hello from browser verify");
  await page.getByRole("button", { name: "Send input" }).click();
  await page.waitForFunction(
    () => document.querySelector(".xterm-screen")?.textContent?.includes("hello from browser verify"),
    undefined,
    { timeout: 10_000 }
  );

  await page.getByPlaceholder("휴대폰 키보드 입력").fill("rm -rf /tmp/example");
  await page.getByRole("button", { name: "Send input" }).click();
  await page.getByText("Recursive deletion requires explicit phone approval.").waitFor({
    state: "visible",
    timeout: 10_000
  });

  const overlay = await page
    .locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")
    .count();
  if (overlay > 0) {
    throw new Error("Framework error overlay is visible.");
  }

  if (consoleErrors.length > 0) {
    throw new Error(`Console errors: ${consoleErrors.join(" | ")}`);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Browser verification passed: ${baseUrl}`);
  console.log(`Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}
