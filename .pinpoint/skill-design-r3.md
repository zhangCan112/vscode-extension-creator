# Round 3（最后一轮）— v1 骨架验收清单

Round 2 已确认：Tool Wrapper + Generator、放 `~/.agents/skills/vscode-extension-dev/`、TS + esbuild + 手写模板、首个项目为「扩展开发速查」侧边栏。

## 功课摘要（来自 3 个现有 skill 的源码）

| 来源 | 吸收什么 |
|---|---|
| awesome-copilot/vscode-ext-commands | 命令双类型规范：常规命令（必须有 category，Command Palette 可见）vs 侧边栏命令（`_` 前缀 + `#sideBar` 后缀，必须有 icon，`enablement`/`when` 控制可见性） |
| awesome-copilot/vscode-ext-localization | 本地化三通道：manifest → `package.nls.LANG.json`；源码字符串 → `bundle.l10n.LANG.json`；walkthrough → 分语言 Markdown |
| aktsmm/vscode-extension-guide | 结构范式（SKILL.md 做路由 hub + references/ 分主题）、Done Criteria 清单式验收、`artifacts/vsix/` 归档约定、常见故障速查表、命名一致性表（包名/设置键/命令 ID/视图 ID 同前缀） |

## v1 目录结构

```
C:\Users\user\.agents\skills\vscode-extension-dev\
├── SKILL.md                       # ≤150 行：frontmatter + When to use + 任务路由表 + Reference Map
├── assets\
│   └── templates\
│       └── ext-ts-esbuild\        # 最小可跑模板（Generator 资产）
│           ├── package.json       # engines.vscode + main + 一个 hello 命令
│           ├── tsconfig.json
│           ├── esbuild.mjs        # 官方范例同款 bundle 脚本
│           ├── .vscode\launch.json    # F5 调试配置
│           ├── .vscodeignore
│           └── src\extension.ts
└── references\
    ├── scaffold.md            # 复制模板→改 manifest→install→F5 的手搭流程
    ├── commands.md            # 命令双类型规范（吸收 awesome-copilot）
    ├── treeview-webview.md    # 首项目需要的 TreeView/命令/状态栏最小实现
    ├── debug-package.md       # 调试技巧 + vsce package + .vscodeignore
    └── lessons.md             # 实践踩坑回填区（进化式，后续再分流到主题文件）
```

## Done Criteria（逐条可勾选）

1. **模板零修改可跑**：复制 `ext-ts-esbuild` → `npm install` → F5，扩展开发宿主中激活，Command Palette 能执行 hello 命令
2. **渐进披露**：SKILL.md 只做路由不含领域知识；单条 reference ≤300 行
3. **触发可靠**：英文 description 覆盖「新建扩展 / 改扩展 / 调试 / 打包 vsix」语义
4. **正文中文 + description 英文**
5. **命令规范、本地化三通道、命名一致性表**已收进对应 reference
6. **实战验证**：首个扩展 `vscode-dev-cheatsheet`（本 repo 子目录）全程用该 skill 指导完成，踩坑当天回填 `lessons.md`

## v1 明确不做（留给实践迭代）

- Marketplace 发布细节（PAT、账号、CI）
- 测试（`@vscode/test-electron`）
- LM Tools / Chat participant 类扩展
- Webview 深度主题（首项目用到 TreeView，Webview 只留最小样例）

---

这是设计树最后一个节点。确认后流程：搭 v1 → 自检（skill-architect Phase 4 checklist）→ 开始第一个扩展。
