# Localization (low-frequency, loaded on demand)

(Adapted from github/awesome-copilot vscode-ext-localization)

VS Code extension localization runs over three channels, **one per kind of localized resource**; whenever you add or change a localizable resource, update the corresponding file for every language already offered.

## 1. Manifest content (settings / commands / menus / views / walkthrough titles)

Strings inside `package.json` become `%key%` placeholders; translations live in:

```
package.nls.json            # default (English)
package.nls.zh-cn.json      # Simplified Chinese
```

```jsonc
// package.json
"commands": [{ "command": "x.hello", "title": "%hello%" }]
// package.nls.json
{ "hello": "Hello" }
// package.nls.zh-cn.json
{ "hello": "你好" }
```

## 2. User-visible strings in source code

```ts
vscode.l10n.t("Hello {0}", name);
```

Translations live in `bundle.l10n.zh-cn.json` (packaging handled by `vsce` automatically; `@vscode/l10n-dev` does the extraction).

## 3. Walkthrough content (Markdown files)

One file per language, e.g. `walkthrough/step1.zh-cn.md`, referenced with locale suffixes in the manifest.

## Checklist

- [ ] manifest changes → `package.nls.*.json` updated for every language in lockstep
- [ ] new user-visible source strings → `vscode.l10n.t` + bundle updated in lockstep
- [ ] inside `markdownDescription`, use the native reference `` `#editor.wordWrap#` `` — the `[label](#editor.wordWrap#)` form leaves a trailing `#` in the Settings `@id:` filter
