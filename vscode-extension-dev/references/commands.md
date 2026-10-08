# 命令：贡献与注册规范

（吸收自 github/awesome-copilot vscode-ext-commands，适配为通用规范）

## 命令双类型

### 1. 常规命令（Command Palette 可见）

```json
{
  "contributes": {
    "commands": [
      { "command": "devCheatsheet.openDocs", "title": "Open Docs", "category": "Dev Cheatsheet" }
    ]
  }
}
```

- `title` 必填；**`category` 必填**（没有 category 的命令在 Palette 里裸奔，和别人的命令混在一起）
- `icon` 可选（仅当命令同时出现在按钮位置时才需要）

### 2. UI 型命令（只出现在视图标题 / 列表项上，Palette 不可见）

```json
{
  "contributes": {
    "commands": [
      { "command": "devCheatsheet.refresh", "title": "Refresh", "category": "Dev Cheatsheet", "icon": "$(refresh)" }
    ],
    "menus": {
      "view/title": [
        { "command": "devCheatsheet.refresh", "when": "view == devCheatsheetDocs", "group": "navigation" }
      ],
      "commandPalette": [
        { "command": "devCheatsheet.refresh", "when": "false" }
      ]
    }
  }
}
```

- **必须定义 `icon`**（`$(name)` 引用内置 codicon），否则视图标题按钮不显示
- 从 Palette 隐藏：`menus.commandPalette` 加 `"when": "false"`
- 位置控制：`group`（`navigation` 组显示为标题栏按钮，其他组进 `...` 菜单）+ `order` 数字
- 可见性 / 可用性：`when` 控制显示，`enablement` 控制灰显
- 可选的家规命名（源自 awesome-copilot）：纯 UI 命令 ID 用 `_` 前缀，如 `_devCheatsheet.refresh#sideBar`

### 3. 数据型命令（只被 UI 代码带参调用，Palette 不可见）

被 `TreeItem.command`、`view/item/context` 菜单等带 `arguments` 调用的命令：

- 同样用 `commandPalette: when false` 藏掉——用户在 Palette 里触发一个缺参数的命令只会得到报错
- **参数按不可信输入处理**：处理器签名收 `(...args: unknown[])`，用类型守卫收窄后再访问属性（直接点属性会 TS2339 且运行时崩）：

```ts
interface DocEntry { url: string }
function isDocEntry(v: unknown): v is DocEntry {
  return typeof v === "object" && v !== null && "url" in v && typeof (v as DocEntry).url === "string";
}

vscode.commands.registerCommand("devCheatsheet.openDoc", (...args: unknown[]) => {
  const entry = args[0];
  if (!isDocEntry(entry)) { logger.warn(`bad args: ${JSON.stringify(args)}`); return; }
  void vscode.env.openExternal(vscode.Uri.parse(entry.url));
});
```

## 代码侧

```ts
const disposable = vscode.commands.registerCommand("devCheatsheet.openDocs", async (arg) => {
  // arg 由调用方决定：Palette 无参，视图项传 TreeItem
});
context.subscriptions.push(disposable);
```

- 每个 disposable 都 push 进 `context.subscriptions`，否则泄漏
- 命令处理器里抛出的异常会被 VS Code 吞成无声失败——async 处理器自己 try/catch 并给出可见反馈

## 命令里操作编辑器（插入 snippet 到光标）

```ts
const editor = vscode.window.activeTextEditor;
if (!editor) {
  vscode.window.showWarningMessage("Open a file first");   // 必须给可见反馈，不能静默 return
  return;
}
const snip = new vscode.SnippetString("vscode.commands.registerCommand($1, () => {$2})");  // $1/$2 是光标占位
void editor.insertSnippet(snip);                            // 插在光标处，自带 undo
// 或纯文本：editor.edit(b => b.insert(editor.selection.active, text));
```

## QuickPick 动态搜索（边输边搜）

`showQuickPick` 只适合静态列表；实时过滤用 `createQuickPick`：

```ts
const qp = vscode.window.createQuickPick();
qp.placeholder = "人名或关系类型";
qp.matchOnDescription = true;                     // 关键：见下方坑
qp.onDidChangeValue((value) => {
  const hits = query(value);                      // 自己的查询逻辑
  qp.items = hits.length
    ? hits.map(h => ({ label: h.label, description: h.searchable }))   // 可搜索文本冗余进 description
    : [{ label: "无匹配", alwaysShow: true }];    // 占位条目必须 alwaysShow
});
qp.onDidAccept(() => { const sel = qp.activeItems[0]; qp.hide(); /* 用 sel */ });
qp.show();
```

坑（真实翻车点）：

- **QuickPick 对 items 有内置模糊过滤**：动态生成的条目 label 不含当前输入会被误隐藏——开 `matchOnDescription` / `matchOnDetail`，并把可搜索文本冗余进 description/detail
- "无匹配"占位条目要 `alwaysShow: true`，否则被同一机制滤掉
- label 里可以用 `$(codicon)` 内联图标

## 快捷键

```json
"keybindings": [
  { "command": "devCheatsheet.openDocs", "key": "ctrl+alt+d", "when": "editorTextFocus" }
]
```

不生效时：先删 `when` 排除条件问题，再查与其他扩展的键冲突（Keyboard Shortcuts 里搜 key）。

## 检查清单

- [ ] 每条命令都有 `title` + `category`
- [ ] manifest 命令 ID 与 `registerCommand` 逐字一致
- [ ] UI 型 / 数据型命令有 icon（按钮场景）、有 `commandPalette: when false`
- [ ] 带参命令有类型守卫，无编辑器场景有可见提示
- [ ] disposable 全部进 `subscriptions`
