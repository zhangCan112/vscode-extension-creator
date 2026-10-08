# vscode-extension-creator

[vscode-extension-dev](./vscode-extension-dev/) skill 的家：一个经过四轮隔离实测锤炼的 VS Code 扩展开发知识库 + TypeScript/esbuild 脚手架模板。

## 仓库内容

| 目录 | 说明 |
|---|---|
| `vscode-extension-dev/` | skill 本体（SKILL.md + 模板 + 中英双语 references：`references/` 中文 / `references-en/` 英文），本机经 junction 链接到 `~/.agents/skills/` 自动加载 |
| `vscode-dev-cheatsheet/` | 实测项目 #1：扩展开发速查侧边栏 |
| `todo-tree/` | 实测项目 #2：内存待办（修复复验轮） |
| `wuxia-relations/` | 实测项目 #3：武侠人物关系图谱（QuickPick + 树 + cytoscape 图视图） |
| `.pinpoint/` | skill 设计过程的 pinpoint 评审文档 |

## 演进记录

skill 的踩坑-回填审计链见 [vscode-extension-dev/references/lessons.md](./vscode-extension-dev/references/lessons.md)：四轮隔离实测共发现并当日修复 18 处缺口。
