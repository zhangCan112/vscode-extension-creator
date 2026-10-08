# 实践教训（lessons）

回填区。每次实践踩坑后**当天**按格式追加；某条规则稳定后分流到对应主题 reference，并在这里删掉。

## 回填格式

```markdown
## YYYY-MM-DD 一句话标题
- 场景：在哪个项目 / 做什么任务
- 症状：看到什么错误或反常
- 根因：真正的原因
- 规则：一句话可执行规则（分流目标：scaffold/commands/treeview-webview/debug-package/localization.md）
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
