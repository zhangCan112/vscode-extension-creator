# 武侠人物关系图谱（wuxia-relations）

内置一套原创武侠人物关系数据（15 个人物、5 种关系类型、24 条关系），提供命令面板实时搜索、侧边栏树视图下钻与可视化力导向关系图。

## 功能

- **搜索**：命令面板执行 `武侠图谱: 搜索人物或关系`
  - 输入人名（如 `李慕远`）→ 实时列出该人物全部关系：对方是谁、关系类型、当前状态
  - 输入关系类型（如 `敌人`）→ 实时列出该类型的所有人物对
  - 输入过程即时过滤，无需回车
- **树视图**：活动栏「武侠图谱」入口，持久展示
  - 搜索结果同步反映在树中并自动聚焦
  - 点击关系行可**下钻**查看对方的关系列表
  - 视图标题按钮：关系图 / 搜索 / 返回全部人物 / 重新加载数据
- **关系图视图**：命令面板执行 `武侠图谱: 打开关系图视图`，或点击树视图标题的图谱按钮
  - 力导向布局：节点 = 人物（按门派着色），边 = 关系（类型着色；带状态用虚线，师徒/单方面带箭头）
  - 支持拖拽、缩放、平移；底部图例说明配色含义
  - **图 ↔ 树联动**：点击图中人物节点，侧边栏树自动下钻到该人物；QuickPick 搜索选中后，图中高亮其关系邻域（其余淡化）
  - 跟随 VS Code 明暗主题（图库 cytoscape 已打包进扩展，离线可用）
- **关系状态**：已决裂 / 已和解 / 隐秘进行中 / 单方面 / 已诀别 等，展示在描述列，备注悬停可见

## 数据

人物与关系存放在 `data/graph.json`，随扩展打包进 VSIX，运行时从 `context.extensionUri` 读取：

- `characters`：`{ id, name, faction, title }`
- `relations`：`{ source, target, type, status?, note? }`，`type` 取值 `朋友 / 敌人 / 师徒 / 亲属 / 恋人`

修改数据后点击视图标题「重新加载数据」即可生效，无需重启。

## 开发

```powershell
npm install
npm run compile        # tsc 类型检查（扩展 + webview 两套 tsconfig）+ esbuild 双入口打包到 dist/
npx @vscode/vsce package --out artifacts/vsix/wuxia-relations-0.1.0.vsix --allow-missing-repository
```

F5 启动 Extension Development Host 调试；改 `package.json` 后需 Reload Window。
