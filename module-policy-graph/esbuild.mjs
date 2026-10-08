import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: "warning",
};

// 双入口、双运行环境：
// - extension：扩展宿主（node，CJS），vscode 模块由宿主提供，标记 external
// - webviewGraph：webview（browser，IIFE 自包含），cytoscape/dagre 等依赖全部打进产物，离线可用、禁止 CDN
const extensionOptions = {
  ...shared,
  entryPoints: ["src/extension.ts"],
  format: "cjs",
  platform: "node",
  external: ["vscode"],
  outfile: "dist/extension.js",
};

const webviewOptions = {
  ...shared,
  entryPoints: ["src/graphView/main.ts"],
  format: "iife",
  platform: "browser",
  outfile: "dist/webviewGraph.js",
};

async function main() {
  if (watch) {
    const extCtx = await esbuild.context(extensionOptions);
    const webCtx = await esbuild.context(webviewOptions);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
  } else {
    await esbuild.build(extensionOptions);
    await esbuild.build(webviewOptions);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
