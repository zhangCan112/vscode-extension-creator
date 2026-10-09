// 用 playwright-core 驱动本机 Edge 无头模式，对 preview-live.html 的各状态截实机图。
// 等待页面把 title 置为 pp-ready（driver 完成全部状态动作后）才截图。node scripts/shoot.mjs
import * as fs from "node:fs";
import * as path from "node:path";
import { chromium } from "playwright-core";

const pageUrl = "file:///" + path.join(process.cwd(), "preview-live.html").replaceAll("\\", "/");
const outDir = path.join(process.cwd(), "preview-shots");
fs.mkdirSync(outDir, { recursive: true });

const SHOTS = [
  ["files", "01-overview-dark"],
  ["light", "02-overview-light"],
  ["focus", "03-focus-workspace"],
  ["channel", "04-channel"],
  ["dangling", "05-dangling-only"],
  ["cycle", "06-cycle-hl"],
  ["demo", "07-demo-100"],
];

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [state, name] of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
    await page.goto(`${pageUrl}#${state}`);
    try {
      await page.waitForFunction(() => document.title === "pp-ready", null, { timeout: 20000 });
    } catch {
      console.error(`TIMEOUT waiting pp-ready for ${state}`);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    const err = await page.evaluate(() => (window.__ppErr ?? "").slice(0, 300));
    if (err) {
      console.error(`PAGE-ERR ${state}: ${err}`);
    }
    await page.close();
    console.log(`shot ${name} (${state})`);
  }
} finally {
  await browser.close();
}
