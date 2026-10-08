// cytoscape-dagre 2.x 未携带类型声明；按其 UMD 用法（cytoscape.use(dagreLayout)）提供最小 ambient 声明
declare module "cytoscape-dagre" {
  import type cytoscape from "cytoscape";
  const dagreLayout: cytoscape.Ext;
  export default dagreLayout;
}
