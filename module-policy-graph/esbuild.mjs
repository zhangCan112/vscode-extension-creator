import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
const selftestOnly = process.argv.includes("--selftest");

async function main() {
  const shared = {
    bundle: true,
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: "warning",
  };

  // 扩展宿主：Node / cjs / vscode 外置
  const host = {
    ...shared,
    entryPoints: ["src/extension.ts"],
    format: "cjs",
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
  };

  // Webview：浏览器 / iife / 依赖全部打入（cytoscape + dagre），css 由旁路产出 dist/webview.css
  const web = {
    ...shared,
    entryPoints: ["src/webview/main.ts"],
    format: "iife",
    platform: "browser",
    outfile: "dist/webview.js",
  };

  // 自验脚本：Node / cjs，仅打包纯领域代码（不依赖 vscode）
  const selftest = {
    ...shared,
    entryPoints: ["src/selftest/main.ts"],
    format: "cjs",
    platform: "node",
    outfile: "dist/selftest.js",
  };

  // pinpoint 审阅用静态快照生成器：领域代码 + dagre 布局 → 内联 SVG 的 HTML
  const preview = {
    ...shared,
    entryPoints: ["src/preview/build.ts"],
    format: "cjs",
    platform: "node",
    outfile: "dist/preview-build.js",
  };

  const configs = selftestOnly ? [selftest] : [host, web, preview];
  if (watch && !selftestOnly) {
    const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(
      configs.map(async (c) => {
        const ctx = await esbuild.context(c);
        await ctx.rebuild();
        await ctx.dispose();
      })
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
