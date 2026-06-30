# Indented Table

Styles pipe tables nested inside list items in Obsidian's live preview. Obsidian ignores these tables because they're indented — this plugin makes them readable without changing the markdown.

## Features

- Hides separator row (`----`)
- Bold header with background
- Faded pipe characters
- Monospace font forced on table regions (fixes proportional font on Android)
- No-wrap on table lines (prevents line breaking mid-row)
- Row borders scoped to table width
- No settings, just enable and it works

## Install

Download `main.js`, `manifest.json`, `styles.css` from [Releases](https://github.com/nnyj/obsidian-indented-table/releases) into `.obsidian/plugins/indented-table/`.

## Build

```bash
npm install
npm run build
```

## How it works

Obsidian blocks widget and replace decorations from plugins, so this uses CM6 mark and line decorations with CSS. It detects indented pipe tables (lines starting with whitespace before `|`) and applies styling classes: `Decoration.line()` for no-wrap and separator hiding, `Decoration.mark()` for header background, row borders, and pipe color — all scoped to the table content width.
