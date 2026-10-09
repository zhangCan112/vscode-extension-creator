import { chromium } from "playwright-core";
import * as fs from "node:fs";

const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage({ viewport: { width: 1680, height: 1000 } });
await p.goto("file:///E:/vscode-extension-creator/module-policy-graph/preview-annot.html#files");
await p.waitForFunction(() => document.title === "pp-ready", null, { timeout: 20000 });

const np = await p.evaluate(() => {
  const cy = window.__mpgCy;
  const r = cy.getElementById("fs").renderedPosition();
  const rect = document.getElementById("cy").getBoundingClientRect();
  return { x: rect.left + r.x, y: rect.top + r.y };
});
await p.click(".pctl button:first-child");
await p.mouse.click(np.x, np.y);
await p.fill(".ppop textarea", "消费测试");
await p.click(".ppop-row button.primary");
await p.waitForTimeout(600);

await p.evaluate(() => window.__mpgCy.zoom(1.5));
await p.waitForTimeout(400);

const before = JSON.parse(fs.readFileSync("preview-shots/annotations.jsonl", "utf8").trim());
const pos = await p.evaluate(() => {
  const e = document.querySelector(".ppin");
  const cy = window.__mpgCy;
  const rect = document.getElementById("cy").getBoundingClientRect();
  return { l: parseFloat(e.style.left), t: parseFloat(e.style.top), z: cy.zoom(), pan: cy.pan(), rt: rect.top };
});
const expectL = before.anchor.x * pos.z + pos.pan.x;
const expectT = pos.rt + before.anchor.y * pos.z + pos.pan.y;
console.log("zoom follow:", pos.l.toFixed(1) === expectL.toFixed(1) && pos.t.toFixed(1) === expectT.toFixed(1),
  "(" + pos.l.toFixed(1) + "," + pos.t.toFixed(1) + ") vs (" + expectL.toFixed(1) + "," + expectT.toFixed(1) + ")");

const res = await (await fetch("http://127.0.0.1:6177/consume", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: before.id, fix: "测试性消化：调整了 fs 节点样式" }),
})).json();
await new Promise((r) => setTimeout(r, 300));
const pending = fs.readFileSync("preview-shots/annotations.jsonl", "utf8").trim();
const audit = fs.readFileSync("preview-shots/annotations-audit.jsonl", "utf8").trim();
console.log("consume:", JSON.stringify(res), "pending now:", JSON.stringify(pending));
console.log("audit:", audit);
console.log("ppErr:", await p.evaluate(() => window.__ppErr));
await b.close();
