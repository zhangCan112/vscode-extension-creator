# 本地化（低频，按需加载）

（吸收自 github/awesome-copilot vscode-ext-localization）

VS Code 扩展本地化分三条通道，**取决于被本地化的资源类型**；新增/修改可本地化资源时，必须同步补齐已有语言的对应文件。

## 1. manifest 内容（settings / commands / menus / views / walkthrough 标题）

`package.json` 里的字符串写成 `%key%` 占位符，翻译放：

```
package.nls.json            # 默认（英语）
package.nls.zh-cn.json      # 简体中文
```

```jsonc
// package.json
"commands": [{ "command": "x.hello", "title": "%hello%" }]
// package.nls.json
{ "hello": "Hello" }
// package.nls.zh-cn.json
{ "hello": "你好" }
```

## 2. 源码里的用户可见字符串

```ts
vscode.l10n.t("Hello {0}", name);
```

翻译放 `bundle.l10n.zh-cn.json`（打包由 `vsce` 自动处理，`@vscode/l10n-dev` 负责提取）。

## 3. Walkthrough 内容（Markdown 文件）

每种语言一个独立文件，如 `walkthrough/step1.zh-cn.md`，manifest 里按 locale 后缀引用。

## 检查清单

- [ ] manifest 改动 → `package.nls.*.json` 全语言同步
- [ ] 源码新增用户可见字符串 → `vscode.l10n.t` + bundle 同步
- [ ] `markdownDescription` 里用原生引用 `` `#editor.wordWrap#` ``，不要用 `[label](#editor.wordWrap#)`（Settings 过滤器会残留尾部 `#`）
