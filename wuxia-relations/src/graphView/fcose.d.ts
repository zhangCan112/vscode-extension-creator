// cytoscape-fcose 2.x 未携带类型声明；按其 UMD 用法（cytoscape.use(fcose)）提供最小 ambient 声明
declare module "cytoscape-fcose" {
  import type cytoscape from "cytoscape";
  const fcose: cytoscape.Ext;
  export default fcose;
}
