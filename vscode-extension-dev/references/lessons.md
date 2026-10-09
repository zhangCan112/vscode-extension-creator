# 实践教训（lessons）

回填区。每次实践踩坑后**当天**按格式追加；某条规则稳定后分流到对应主题 reference，并在这里删掉。

## 回填格式

```markdown
## YYYY-MM-DD 一句话标题
- 场景：在哪个项目 / 做什么任务
- 症状：看到什么错误或反常
- 根因：真正的原因
- 规则：一句话可执行规则（分流目标：scaffold/commands/treeview-webview/graph-visualization/debug-package/localization.md）
```

## 铁律

- 只记录**可泛化**的教训，不记一次性琐事
- 规则必须可执行（"做 X 时先 Y"），不写"注意 X"
- 首条教训将由 `vscode-dev-cheatsheet` 项目回填

## 2026-10-08 v1 首场实测：8 处缺口当日修复

- 场景：隔离 subagent 仅凭 skill 从零建 vscode-dev-cheatsheet（首个扩展），install/compile/package/vsce 全过
- 症状：activationEvents 指导误导致状态栏不激活；vsce ENOENT；图标素材 / 编辑器插入 / 带参命令规范 / viewWelcome 可达性 / unknown 参数收窄 / LICENSE 严重级别 共 8 处缺口
- 根因：v1 只吸收了 3 个源 skill 的知识，未经真实项目校验
- 规则：8 处已全部直接修复进 scaffold.md / commands.md / treeview-webview.md / debug-package.md 及模板（media/bar.svg、artifacts/vsix/.gitkeep），此处不留副本；修复待下一次实践复验
- 复验：2026-10-08 当日第二场隔离实测（todo-tree 项目）**8/8 一次通过**，activationEvents/vsce 目录/类型守卫等均按 skill 指引预防到位；新增唯一微缺口（publisher 占位值）已补进 scaffold.md

## 2026-10-08 第三场实测（wuxia-relations）：4 处新缺口

- 场景：人物关系图谱扩展，新撞 QuickPick 动态搜索 / 随包数据分发 / 树 reveal 聚焦 / 新 API 与 engines 版本对齐四个 API 面
- 症状：QuickPick 内置模糊过滤误隐藏动态条目；`TreeItem.detail`（1.88+）在 ^1.85 模板下 TS2339；reveal 的 Thenable 无 `.catch`；元素实例与 provider 返回值不同引用时 reveal 无效
- 根因：skill 的 API 面此前只覆盖命令 + 树的基础层
- 规则：QuickPick 节 → commands.md；reveal 细节 → treeview-webview.md；.vscodeignore 黑名单机制 → debug-package.md；engines 对齐 → scaffold.md；前两轮全部修复在本场继续一次通过

## 2026-10-08 第四场实测（wuxia-relations 图视图）：5 处新缺口

- 场景：给关系图谱加 Webview + cytoscape 力导向图（图↔树联动、主题适配、图库离线打包）
- 症状：Webview 章节停留在最小内联样例——双 bundle 构建、外链脚本 CSP（cspSource vs nonce）、ready 握手时序、单例生命周期、canvas 吃不到 CSS 变量，五块全靠自己补；另踩 tsconfig extends 继承 exclude（TS18003）
- 根因：v1 的 Webview 章节只覆盖"最小安全样例"，缺真实 webview 应用的工程层
- 规则：五块已补进 treeview-webview.md「Webview 工程化」节；cytoscape 拖拽误触 tap 的区分属库特定经验，不入正文

## 2026-10-08 第六场实测（module-policy-graph）：图可视化设计层成文

- 场景：SEND/RECEIVE 双向声明 policy 依赖图 webview（cytoscape + dagre），含确定性 100 模块生成器压测
- 症状：图可视化设计层此前完全缺位——初版 cose 布局画 DAG、全量边标签常显、聚焦用淡化，用户连续两轮评"乱"；100 节点时总览不可读
- 根因：布局与图语义错配、违反按需披露；skill 只覆盖 webview 工程层（双 bundle/CSP/主题），没有"图该怎么画"的风格层
- 规则：风格指南成文 `references/graph-visualization.md`（布局选择 / 编码 / 渐进披露 / 规模阶梯 / 双向声明匹配），SKILL.md 路由表与何时使用已挂；聚焦 = 子图隔离而非淡化是本场最关键修正

## 2026-10-09 第七场实测（module-policy-graph 隔离复测）：图风格层一次到位，新缺口集中在库类型面

- 场景：不限定图库选型的隔离实测，仅凭 skill 从零建 policy 双向声明依赖图（四层 DAG + 声明匹配 + 确定性 100 模块压测 + VSIX）
- 症状：图风格层零返工——自主走到 cytoscape + dagre TB 路线，子图隔离/三重编码/悬空编码/规模阶梯全部一次按 skill 执行；前六场累计修复（activationEvents、外链 CSP、双 bundle、viewWelcome 可达性等）本场继续全部一次通过。新缺口 2 处：@types/cytoscape 未声明 `show()/hide()` 且枚举样式属性拒绝 `data()` 映射、`Stylesheet` 类型已改名；可枚举验收缺第三 bundle 自验的成文做法
- 根因：skill 只沉淀了布局扩展 ambient d.ts 一个库类型坑，没覆盖 @types 严格化后的样式表/集合类型面；"验收标准可枚举"时缺一键自验的工程套路
- 规则：两处已分流——graph-visualization.md 落地要点（样式表整体 cast + 显隐走 class/display:none + 可见集合纯数据层算 id Set）、scaffold.md（第三 bundle selftest 套路）；本场另自验通过"空树才配 viewWelcome"与 engines 对齐两条既有规则（badge 超出 ^1.85 主动降级为 description）

## 2026-10-08 第五场实测（greek-relations，英文版验证）：英文树通过

- 场景：两阶段隔离实测（阶段一：数据 + QuickPick 实时搜索 + 树联动；阶段二：Webview 图视图），全程只用 vscode-extension-dev-en
- 症状：无功能性缺口；收 7 处微缺口——reveal 时序原理、Separator 过滤行为、宿主重启后树状态、原始值类型守卫、旁路 css 的 CSP 待遇、子 tsconfig 的 module 设置、CSSOM 与 CSP 的关系
- 根因：微缺口均属「规则成立但没讲为什么/边界」
- 规则：7 处已同步分流至中英两棵树；Webview 工程化五块全部被验证有效，前 18 处修复继续生效
