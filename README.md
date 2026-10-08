# vscode-extension-creator

[vscode-extension-dev](./vscode-extension-dev/)（中文）与 [vscode-extension-dev-en](./vscode-extension-dev-en/)（English）的家：两个完全独立、各自可单独安装的 VS Code 扩展开发 skill，经四轮隔离实测锤炼（TypeScript + esbuild 脚手架 + 知识库）。

> **同步铁律**：两个 skill 目录内容必须同步演进——任何内容修复同日落两边。

## 仓库内容

| 目录 | 说明 |
|---|---|
| `vscode-extension-dev/` | 中文版 skill（本机经 junction 链接到 `~/.agents/skills/` 自动加载） |
| `vscode-extension-dev-en/` | 英文版 skill（独立完整目录，可单独 `npx skills add`） |
| `vscode-dev-cheatsheet/` | 实测项目 #1：扩展开发速查侧边栏 |
| `todo-tree/` | 实测项目 #2：内存待办（修复复验轮） |
| `wuxia-relations/` | 实测项目 #3：武侠人物关系图谱（QuickPick + 树 + cytoscape 图视图） |
| `.pinpoint/` | skill 设计过程的 pinpoint 评审文档 |

## 演进记录

skill 的踩坑-回填审计链见 [vscode-extension-dev/references/lessons.md](./vscode-extension-dev/references/lessons.md)：四轮隔离实测共发现并当日修复 18 处缺口。
