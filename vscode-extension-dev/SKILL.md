---
name: vscode-extension-dev
description: VS Code 扩展开发工具箱——TypeScript + esbuild 脚手架与全流程规范（命令 / TreeView / Webview / 调试 / 打包 VSIX）。做扩展开发时手动调用。
disable-model-invocation: true
metadata:
  pattern: tool-wrapper+generator
  domain: vscode-extension
---

# VS Code 扩展开发

## 概述

TypeScript + esbuild 技术栈的 VS Code 扩展开发知识库 + 脚手架模板。零脚本、零三方依赖：本 skill 只有文档和静态模板，所有构建依赖（esbuild、@types/vscode、vsce）都声明在扩展项目自己的 `package.json` 里或由 `npx` 按需拉取。

## 何时使用

- 从零新建一个 VS Code 扩展
- 给现有扩展加命令、TreeView、Webview、状态栏、配置项
- 在 Webview 里做图可视化（关系图 / 依赖图 / 策略图）
- F5 调试不生效、扩展不激活、命令找不到
- 用 vsce 打包 / 安装 VSIX

**不要用于：** VS Code 用户设置、`keybindings.json`、主题配色——那是编辑器配置，不是扩展开发。

## 任务路由表

| 任务 | 动作 |
|---|---|
| 新建扩展 | 读 `references/scaffold.md`，复制 `assets/templates/ext-ts-esbuild/` |
| 加 / 改命令 | 读 `references/commands.md` |
| 侧边栏 / 树视图 / Webview / 状态栏 | 读 `references/treeview-webview.md` |
| 做关系图 / 依赖图 / 图可视化 | 读 `references/graph-visualization.md` |
| 调试 / 打包 VSIX | 读 `references/debug-package.md` |
| 多语言 / 本地化 | 读 `references/localization.md` |
| 踩坑了 | 先查 `references/lessons.md`；新坑按其头部格式当天回填 |

## 硬规则（任何任务都遵守）

1. **命名一致性**：包名、设置键、命令 ID、视图 ID 用同一前缀（表见 `references/scaffold.md`）
2. **命令 ID 逐字一致**：`contributes.commands` 的 `command` 与代码里 `registerCommand` 的 ID 必须完全相同
3. **资源路径**：一律从 `context.extensionUri` + `vscode.Uri.joinPath` 解析，禁止猜测安装路径或用户目录
4. **日志**：不散落 `console.log`，用 OutputChannel 聚合（最小实现见 `references/debug-package.md`）
5. **VSIX 产物**：输出到 `artifacts/vsix/`，不提交进 git

## 脚手架

唯一脚手架来源是 `assets/templates/ext-ts-esbuild/`——复制后按 `references/scaffold.md` 的改名清单处理，不要用 `yo code` 生成再改。
