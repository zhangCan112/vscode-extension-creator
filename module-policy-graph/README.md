# 模块访问策略图（module-policy-graph）

把代码库中各模块的 policy 声明聚合为一张可视化关系图，用于日常审查模块间的依赖健康度。

- **通道语义**：一条通道（A→B, type）成立，当且仅当 A 的 `send` 与 B 的 `receive` 双方声明对齐；单边声明为**悬空发送**（send 有 receive 无）或**悬空订阅**（receive 有 send 无）
- **消息类型**：`command`（写/触发）、`query`（请求-响应读）、`viewquery`（只读视图快照查询），颜色 × 线型 × 箭头形状三重编码，缩小/色弱可辨
- **层级**：entry / feature / domain / infra 四层，dagre 自上而下分层布局，箭头方向即消息流方向

## 使用

1. F5 启动调试（或安装 VSIX）
2. 左侧活动栏「模块访问策略」→ 视图标题栏按钮：打开大图 / 重载数据 / 生成演示
3. 命令面板：`模块访问策略: 打开策略关系图` / `重载策略文件` / `生成 100 模块演示数据`

图交互：

| 操作 | 效果 |
|---|---|
| 点击模块 | 只看该模块相关关系（子图隔离 + 重排）+ 右侧 policy 详情（含 ✓/✗ 对齐状态，行可点下钻） |
| 点击边 / 详情行 | 只看这一条通道 |
| 面包屑 / Esc / 点空白 | 逐级返回；点空白一步回总览 |
| 悬停 | 临时高亮邻域，不跳视口 |
| 只看悬空 | 一键筛出全部单边声明 |
| 高亮循环 | 高亮所有处在环上的已对齐通道（悬空不计入） |
| 图例 | 点击消息类型 / 层级行显隐对应元素 |

主题跟随 VS Code 明暗，切换主题不丢图状态。Webview 完全离线（cytoscape + dagre 随扩展打包）。

## 数据

每个模块一份 `data/policies/<模块名>.policy.json`：

```json
{
  "module": "auth",
  "tier": "domain",
  "description": "认证与账户领域",
  "send": [{ "to": "logger", "type": "command" }],
  "receive": [{ "from": "app-shell", "type": "query" }]
}
```

校验：tier/type 枚举、模块 id 全局唯一、同文件不重复声明、跨文件引用的模块必须存在、module 字段与文件名一致；任何错误都在通知 + 「模块访问策略」输出频道中定位到具体文件。

随包演示数据 10 模块（覆盖四层，含 workspace↔editor 一组循环依赖、git→logger query 悬空发送、app-shell→settings command 悬空订阅）。「生成 100 模块演示数据」以固定种子确定性生成（entry 8 / feature 30 / domain 34 / infra 28，约 217 条对齐通道、11 条悬空、19 条循环通道），不落盘。

## 开发

```powershell
npm install
npm run compile    # 类型检查 + 双 bundle（dist/extension.js + dist/webview.js）
npm run selftest   # 枚举预期结果自验：对齐/悬空/循环判定、错误定位、演示确定性
npm run watch      # F5 调试用
npx @vscode/vsce package --out artifacts/vsix/module-policy-graph-0.1.0.vsix --allow-missing-repository
```

架构：匹配状态、循环检测、演示生成全部在扩展宿主侧算好，webview 只消费；两 bundle 共享 `src/shared/`（不 import vscode）。
