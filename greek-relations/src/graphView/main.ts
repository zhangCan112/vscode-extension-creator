// Webview entry for the Greek relations graph. Bundled by esbuild into
// dist/graphView.js (iife, browser platform) and loaded as an external script.

import "./graph.css";
import { isHostToGraphMessage } from "./protocol";
import { GraphRenderer } from "./render";

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

function element(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`missing #${id} in graph HTML`);
  }
  return el;
}

const vscode = acquireVsCodeApi();
const renderer = new GraphRenderer(element("graph"), element("legend"), element("hint"), element("info"), (deityId) =>
  vscode.postMessage({ type: "selectDeity", deityId })
);

window.addEventListener("message", (e: MessageEvent) => {
  const msg: unknown = e.data;
  if (!isHostToGraphMessage(msg)) {
    return;
  }
  switch (msg.type) {
    case "data":
      renderer.setData(msg.deities, msg.relations);
      break;
    case "focus":
      renderer.focus(msg.nodeIds, msg.edgeIds);
      break;
    case "clearFocus":
      renderer.clearFocus();
      break;
  }
});

renderer.start();
vscode.postMessage({ type: "ready" });
