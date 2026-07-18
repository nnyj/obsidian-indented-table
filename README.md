# obsidian-indented-table

<div align="center">

[![Stars](https://img.shields.io/github/stars/nnyj/obsidian-indented-table?style=for-the-badge&labelColor=555&color=e3b341)](https://github.com/nnyj/obsidian-indented-table/stargazers)
[![Downloads](https://img.shields.io/github/downloads/nnyj/obsidian-indented-table/total?style=for-the-badge&labelColor=555&color=2ea44f)](https://github.com/nnyj/obsidian-indented-table/releases)
[![Latest Release](https://img.shields.io/github/v/release/nnyj/obsidian-indented-table?style=for-the-badge&label=Latest%20Release&labelColor=555&color=3572d6)](https://github.com/nnyj/obsidian-indented-table/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/nnyj/obsidian-indented-table/release.yml?style=for-the-badge&labelColor=555)](https://github.com/nnyj/obsidian-indented-table/actions)

</div>

Styles pipe tables nested inside list items in Obsidian live preview. Obsidian ignores indented tables, rendering them as plain text — this plugin makes them readable without changing the markdown.

## Features

- Hides separator row
- Bold header with background fill
- Faded pipe characters
- No-wrap per row, prevents mid-row line breaks
- Forces monospace font on table regions (fixes proportional font on Android)
- Row borders scoped to table content width

## Install

Search "Indented Table" in Settings > Community plugins > Browse.

Manual: download `main.js`, `manifest.json`, `styles.css` from [Releases](https://github.com/nnyj/obsidian-indented-table/releases) into `.obsidian/plugins/indented-table/`.

## How it works

Obsidian blocks widget and replace decorations from plugins. The plugin uses CM6 mark and line decorations with CSS: `Decoration.line()` for no-wrap and separator hiding, `Decoration.mark()` for header background, row borders, and pipe color, all scoped to table content width.

## Build

```sh
npm install
npm run build
```

## License

[MIT](LICENSE)
