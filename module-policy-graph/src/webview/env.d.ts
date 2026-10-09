declare module "*.css";

declare module "cytoscape-dagre" {
  import type cytoscape from "cytoscape";
  const ext: cytoscape.Ext;
  export default ext;
}

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
