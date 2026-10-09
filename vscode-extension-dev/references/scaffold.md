# 脚手架：从模板建一个新扩展

## 前置检查

```powershell
node -v          # 需要 18+
code --version   # VS Code CLI 可用
```

## 步骤

1. **复制模板**到你的工作目录（为项目新建子目录 `<project-name>/`；模板位于本 skill 的 `assets/templates/ext-ts-esbuild/`）
2. **按下方改名清单**处理所有标识符
3. `npm install`
4. 用 VS Code 打开项目目录，按 **F5**（等 watch 任务完成编译后宿主窗口启动）
5. 宿主窗口 Command Palette 执行改名后的 hello 命令，看到通知即成功

## 改名清单（逐项过）

`package.json`：

| 字段 | 模板值 | 改成 |
|---|---|---|
| `name` / `displayName` / `description` | ext-ts-esbuild… | 项目自己的 |
| `contributes.commands[].command` | `template.hello` | `<prefix>.hello` |
| `contributes.commands[].category` | Template | 项目显示名 |
| `publisher` | （无） | 你的 ID（打包 VSIX 前必须补；无 Marketplace 账号可先用占位符如 `indie-dev`，不影响本地 VSIX 安装使用） |
| `activationEvents` | `[]` | 有启动期功能（状态栏、后台任务）时改 `["onStartupFinished"]`，见下方必懂字段 |

`src/extension.ts`：`registerCommand("template.hello", …)` 同步改成新命令 ID。

`README.md`：重写为项目自己的说明（模板 stub 文案不能带出去）。

`media/`：模板已带占位 `media/bar.svg`（活动栏图标），按项目替换；自绘规范见 treeview-webview.md。

## 命名一致性表

同一扩展内所有标识符共用一个前缀，发布前逐行核对：

| 项 | 规则 | 示例（前缀 `devCheatsheet`） |
|---|---|---|
| 包名 | kebab-case | `dev-cheatsheet` |
| 设置键 | `<prefix>.<camel>` | `devCheatsheet.enabled` |
| 命令 ID | `<prefix>.<verb>` | `devCheatsheet.openDocs` |
| 视图 ID | `<prefix><Noun>` | `devCheatsheetDocs` |

## manifest 必懂字段

- `main`：**`./dist/extension.js`**（esbuild 产物目录，不是 `out/`——tsc 只做类型检查不产出）
- `engines.vscode`：决定最低 VS Code 版本与可用的 `@types/vscode` 版本，两者保持一致；**用了高于 engines 的 API 会直接 TS2339**（如 `TreeItem.detail` 是 1.88+，模板是 ^1.85）——报这个错先查 API 的引入版本，换旧 API（并入 description/tooltip）或同步抬 engines
- `activationEvents`：命令 / 树视图触发时 1.74+ 隐式激活，纯命令型可留空；但**启动时就要存在的东西（状态栏按钮、后台任务）必须显式声明 `"activationEvents": ["onStartupFinished"]`**——否则扩展在用户第一次调用命令前根本不激活，状态栏不会出现
- `contributes`：命令、视图、配置、快捷键的唯一声明处，改代码时同步改这里

## 常见坑

| 症状 | 原因 |
|---|---|
| F5 后命令不存在 | `main` 被改成 `out/`；或 watch 任务没跑完就打开了 Palette |
| 激活了但命令报 not found | manifest 与代码的命令 ID 不一致（大小写也算） |
| 打包报缺 README/publisher | 模板带了 stub README 但要重写；`publisher` 必须补上 |
| 状态栏 / 启动期功能不出现 | 缺 `"activationEvents": ["onStartupFinished"]`，隐式激活只覆盖命令和视图触发 |

## 可枚举验收 → 第三 bundle 自验

需求给出可枚举的预期结果（如"10 文件、恰 N 条对齐、某循环、某悬空"）时，加一个 esbuild 第三入口（node/cjs）打成 `dist/selftest.js`，`npm run selftest` 一键核对。前提：领域代码（解析/匹配/生成器）放独立目录且**不 import vscode**，宿主与 selftest 共同复用。`.vscodeignore` 排除 `dist/selftest.js`。
