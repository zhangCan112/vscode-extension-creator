// Webview-side ambient declarations (compiled only by tsconfig.webview.json).

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

declare module "*.css";
