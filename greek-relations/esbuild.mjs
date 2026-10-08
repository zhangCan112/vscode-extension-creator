import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

// Dual bundles: extension host (Node, cjs, vscode external) and webview
// (browser, iife, everything — cytoscape included — bundled in).
const common = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: "warning",
};

const host = {
  ...common,
  entryPoints: ["src/extension.ts"],
  format: "cjs",
  platform: "node",
  outfile: "dist/extension.js",
  external: ["vscode"],
};

const web = {
  ...common,
  entryPoints: ["src/graphView/main.ts"],
  format: "iife",
  platform: "browser",
  outfile: "dist/graphView.js",
};

async function main() {
  if (watch) {
    const [hostCtx, webCtx] = await Promise.all([esbuild.context(host), esbuild.context(web)]);
    await Promise.all([hostCtx.watch(), webCtx.watch()]);
  } else {
    await Promise.all([esbuild.build(host), esbuild.build(web)]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
