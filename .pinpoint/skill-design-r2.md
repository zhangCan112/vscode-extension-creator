# Round 2 — 新建 VSCode 扩展开发 skill：设计树第二轮问题

Round 1 已全部确认：覆盖「从零到本地打包」分层全流程、混合策略（先骨架 v1 再实践沉淀）、小而完整的首个项目、自用为主保持可发布、本 repo 做练兵场。

但注意：Q3 你同意的是「从小项目开始」这个策略，**第一个扩展具体做什么还没定**——本轮补上。以下是第二轮前沿问题：

## Q1 — 架构模式（skill-architect 决策树）

候选组合：

- **Tool Wrapper**（领域专家知识库，`references/` 按需加载）
- **Tool Wrapper + Generator**（知识库 + `assets/` 脚手架模板：package.json / tsconfig / launch.json / webview 样板）
- **Pipeline**（「新建扩展」走 固定步骤→实现→校验→打包 的带门流水线）

> **推荐**：Tool Wrapper + Generator 组合，不套 Pipeline。理由：写扩展不是每次走同一条流水线（命令型/Webview 型/语言特性型路径差异大），硬套门控只会添堵；skill 的核心价值是领域知识 + 可复用模板。skill-architect 铁律：证明有收益才加 Pipeline 复杂度。

## Q2 — skill 的身份三件套：位置、名字、语言

- **位置**：`C:\Users\user\.agents\skills\`（你的 9 个 skill 在这）还是 `C:\Users\user\.claude\skills\`（writing-skills、evolving-skill-rules 在这）？两者都会被加载。
- **名字**：`vscode-extension-dev`？还是别的？
- **语言**：frontmatter description 用英文（触发匹配更稳）+ 正文中文？

> **推荐**：放 `C:\Users\user\.agents\skills\vscode-extension-dev\`（你大部分 skill 的根据地），名字就用 `vscode-extension-dev`，description 英文 + 正文中文。

## Q3 — 技术栈（skill 模板将固化这个选择）

- 语言：TypeScript（官方生态默认）
- 打包：esbuild（官方 generator 现默认）vs 不打包 vs webpack
- 脚手架：用官方 `yo code` 生成器，还是 skill 自带手写模板（`assets/` 里放我们自己的样板，可控、可演化）？

> **推荐**：TypeScript + esbuild + 手写模板。不依赖 `yo`——skill 自带模板才能把我们的实践经验固化进去，`yo` 生成的样板反而是要被替换的。

## Q4 — 第一个扩展到底做什么（开放题）

你之前说「想写一些扩展 app」——心里有既定想法就说出来；没有的话我提一个默认提案：

- **提案**：「扩展开发速查」侧边栏——TreeView 列官方 API 文档链接 + 常用代码 snippet 一键插入 + 几个 Command Palette 命令。小而完整，同时覆盖命令、TreeView、状态栏，走完全流程。

> **推荐**：如果你没有更想做的，就用上面的提案；有既定想法则直接告诉我，skill 的首批 references 会围绕它的 API 面来写。

---

本轮答完后，剩余分支只剩：v1 骨架的验收清单（我来起草、你确认）。读完 3 个现有 skill 源码 + 官方文档后我会开始搭 v1。
