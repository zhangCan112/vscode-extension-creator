# 调试与打包

## F5 调试

模板自带 `.vscode/launch.json` + `tasks.json`：F5 = 先跑 `npm run watch`（esbuild 增量编译到 `dist/`），再启动 **Extension Development Host**（一个加载了你扩展的独立 VS Code 窗口）。

- 断点直接打在 `src/extension.ts`，宿主窗口里触发
- 改代码 → 保存 → 宿主窗口自动热更新大部分内容；manifest（package.json）改动必须 **Developer: Reload Window**
- 调试日志：宿主窗口里 `Developer: Toggle Developer Tools` 的 Console，或主窗口的 Debug Console

## OutputChannel 日志（替代散落的 console.log）

```ts
const logger = vscode.window.createOutputChannel("Dev Cheatsheet", { log: true });
context.subscriptions.push(logger);
logger.info("activated");       // 带 时间戳/级别，宿主 Console 同步可见
```

给用户留一条打开日志的入口（命令或通知按钮）。

## 常见故障速查

| 症状 | 排查 |
|---|---|
| 扩展不加载 | `main` 是否指向 `./dist/extension.js`；`engines.vscode` 是否高于宿主版本 |
| 命令找不到 | manifest 与代码命令 ID 逐字比对；`package.json` 改后是否 Reload Window |
| 改代码没生效 | watch 任务是否在跑（终端看 esbuild）；宿主窗口是否 reload |
| 快捷键不生效 | 删 `when` 排除；Keyboard Shortcuts 搜键查冲突 |
| 扩展激活了但没反应 | 处理器 async 异常被吞——加 try/catch + 日志 |

## 打包 VSIX

```powershell
npx @vscode/vsce package --out artifacts/vsix/dev-cheatsheet-0.0.1.vsix
```

- 前提：`publisher` 已填、README 存在（模板已带）；没有 git repository 字段时加 `--allow-missing-repository`
- **先确保输出目录存在**：vsce 不创建 `--out` 的父目录，目录不存在直接 ENOENT（模板已预置 `artifacts/vsix/.gitkeep`）
- `npx @vscode/vsce`（当前 4.x）缺 LICENSE 只是 **WARNING，不阻塞**；正式发布前再补
- `vscode:prepublish` 钩子会自动跑 production 构建
- `.vscodeignore` 是**排除清单（黑名单）**：没列的都进包——`media/`、`data/` 等非代码资源默认随 VSIX 分发，运行时按硬规则 3 用 `extensionUri + joinPath` 读取；`src/`、`node_modules/`、`*.map` 在清单里被排除。打包后核对 vsce 输出的文件清单，确认数据/图标确实在包里——产物体积目标 < 5MB
- 产物只放 `artifacts/vsix/`（gitignore 已配，`.gitkeep` 例外保留）

## 安装验证（Done 标准）

```powershell
code --install-extension artifacts/vsix/dev-cheatsheet-0.0.1.vsix --force   # 装新版覆盖旧版
code --uninstall-extension indie-dev.dev-cheatsheet                        # 卸载：ID = publisher.name
```

开发期**不需要安装**——F5 的宿主窗口直接加载源码；安装/卸载只用于验证产物或交付给别人。已装旧版再 F5 调试时注意：宿主窗口加载的是源码版，正式窗口里是安装版，两者并存互不影响。

用隔离 profile 更干净：`code --profileExt --user-data-dir <tmp> --extensions-dir <tmp> --install-extension <vsix>`，然后走一遍核心工作流，确认命令 / 视图 / 图标都在。

## 明确不在 v1 范围

Marketplace 发布（PAT/账号/CI）、`@vscode/test-electron` 自动化测试——需要时先查 `references/lessons.md` 是否已沉淀，再做并回填。
