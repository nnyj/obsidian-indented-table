import { Component, MarkdownRenderer, Plugin, editorInfoField, editorLivePreviewField } from 'obsidian';
import { ViewPlugin, Decoration, EditorView, ViewUpdate, DecorationSet, WidgetType } from '@codemirror/view';
import { EditorState, Range, StateField, Text } from '@codemirror/state';

const RE_ROW = /^\s*\|(.+)\|\s*$/;
const RE_SEP = /^\s*\|[\s:|-]+\|\s*$/;
const RE_FENCE = /^\s*(```|~~~)/;

/** Line numbers of a table: header, separator, last row. */
interface TableLines { start: number; sep: number; end: number }

function findTables(doc: Text): TableLines[] {
  const tables: TableLines[] = [];
  let fenced = false;
  let i = 1;
  while (i <= doc.lines) {
    const text = doc.line(i).text;
    if (RE_FENCE.test(text)) fenced = !fenced;
    if (fenced || !RE_ROW.test(text)) { i++; continue; }
    let j = i + 1;
    while (j <= doc.lines && RE_ROW.test(doc.line(j).text)) j++;
    if (j - i >= 3 && RE_SEP.test(doc.line(i + 1).text)) tables.push({ start: i, sep: i + 1, end: j - 1 });
    i = j;
  }
  return tables;
}

function pipeRange(line: { from: number; text: string }): [number, number] {
  const first = line.text.indexOf('|');
  const last = line.text.lastIndexOf('|');
  return [line.from + first, line.from + last + 1];
}

/** Cells between unescaped pipes. from..to bounds the trimmed text, or the whole space between the pipes when empty. */
function rowCells(text: string): { from: number; to: number; text: string }[] {
  const pipes: number[] = [];
  for (let c = 0; c < text.length; c++)
    if (text[c] === '|' && text[c - 1] !== '\\') pipes.push(c);
  return pipes.slice(1).map((end, k) => {
    const raw = text.slice(pipes[k]! + 1, end);
    const trimmed = raw.trim();
    if (!trimmed) return { from: pipes[k]! + 1, to: end, text: '' };
    const from = pipes[k]! + 1 + raw.length - raw.trimStart().length;
    return { from, to: from + trimmed.length, text: trimmed };
  });
}

// Source styling, shown in source mode
function buildDecorations(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const ranges: Range<Decoration>[] = [];
  for (const { start, sep, end } of findTables(doc)) {
    const hdr = doc.line(start);
    const [hFrom, hTo] = pipeRange(hdr);
    ranges.push(Decoration.line({ class: 'it-nowrap' }).range(hdr.from));
    ranges.push(Decoration.mark({ class: 'it-header' }).range(hFrom, hTo));
    ranges.push(Decoration.line({ class: 'it-sep' }).range(doc.line(sep).from));
    for (let n = sep + 1; n <= end; n++) {
      const row = doc.line(n);
      const [rFrom, rTo] = pipeRange(row);
      ranges.push(Decoration.line({ class: 'it-nowrap' }).range(row.from));
      ranges.push(Decoration.mark({ class: 'it-row' }).range(rFrom, rTo));
    }
    for (let n = start; n <= end; n++) {
      if (n === sep) continue;
      const ln = doc.line(n);
      for (let c = 0; c < ln.text.length; c++) {
        if (ln.text[c] === '|')
          ranges.push(Decoration.mark({ class: 'it-pipe' }).range(ln.from + c, ln.from + c + 1));
      }
    }
  }
  return Decoration.set(ranges, true);
}

const tablePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged)
        this.decorations = buildDecorations(update.view);
    }
  },
  { decorations: (v) => v.decorations }
);

const components = new WeakMap<HTMLElement, Component>();
// Cell to edit once the table re-renders after a Tab save changed its source
let pendingEdit: { from: number; row: number; column: number } | undefined;

/** Rendered table in place of the source lines, edited per cell like Obsidian's own tables. */
class TableWidget extends WidgetType {
  constructor(
    private readonly source: string,
    private readonly from: number,
    private readonly plugin: Plugin,
    private readonly sourcePath: string,
  ) {
    super();
  }

  // Position stays out: same source keeps the DOM when lines above change
  eq(other: TableWidget): boolean {
    return other.source === this.source && other.sourcePath === this.sourcePath;
  }

  toDOM(view: EditorView): HTMLElement {
    const [header = '', , ...body] = this.source.split('\n');
    const indent = header.length - header.trimStart().length;
    const wrap = createDiv({ cls: 'it-widget' });
    wrap.setCssProps({ '--it-indent': `${indent}ch` });
    const component = new Component();
    component.load();
    components.set(wrap, component);
    const table = wrap.createEl('table');
    [header, ...body].forEach((line, row) => {
      const tr = table.createEl('tr');
      rowCells(line).forEach((cell, column) => {
        const td = tr.createEl(row === 0 ? 'th' : 'td', { attr: { 'data-cell': `${row},${column}` } });
        this.renderCell(td, cell.text, component);
      });
    });
    wrap.addEventListener('mousedown', event => this.onMouseDown(view, wrap, event));
    const pending = pendingEdit;
    if (pending?.from === this.from) {
      pendingEdit = undefined;
      // posAtDOM needs the widget in the document
      window.requestAnimationFrame(() => this.editCell(view, wrap, pending.row, pending.column));
    }
    return wrap;
  }

  destroy(dom: HTMLElement): void {
    components.get(dom)?.unload();
  }

  /** Plain text first: nnyj-syntax-highlight shades cells by their text on the next view update. */
  private renderCell(td: HTMLElement, text: string, component: Component): void {
    td.setText(text);
    const holder = createDiv();
    void MarkdownRenderer.render(this.plugin.app, text, holder, this.sourcePath, component).then(() => {
      td.replaceChildren(...Array.from((holder.querySelector('p') ?? holder).childNodes));
    });
  }

  /** Internal links open, external links keep the default, a click on a cell edits it. */
  private onMouseDown(view: EditorView, wrap: HTMLElement, event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.it-editing')) return;
    const link = target.closest('a');
    if (link) {
      if (link.hasClass('internal-link')) {
        event.preventDefault();
        void this.plugin.app.workspace.openLinkText(link.getAttr('data-href') ?? '', this.sourcePath);
      }
      return;
    }
    const cell = target.closest('[data-cell]');
    if (!cell) return;
    event.preventDefault();
    const [row = 0, column = 0] = (cell.getAttr('data-cell') ?? '').split(',').map(Number);
    this.editCell(view, wrap, row, column);
  }

  /** Document range of a table cell, body row n sits below the separator line. */
  private cellSource(view: EditorView, wrap: HTMLElement, row: number, column: number) {
    const { doc } = view.state;
    const start = doc.lineAt(view.posAtDOM(wrap)).number;
    const line = doc.line(Math.min(doc.lines, start + (row === 0 ? 0 : row + 1)));
    const cell = rowCells(line.text)[column];
    return cell && { tableFrom: doc.line(start).from, from: line.from + cell.from, to: line.from + cell.to, text: cell.text };
  }

  /** Cell shows its raw markdown while edited. Enter or blur saves, Escape cancels, Tab saves and moves on. */
  private editCell(view: EditorView, wrap: HTMLElement, row: number, column: number): void {
    const td = wrap.querySelector<HTMLElement>(`[data-cell="${row},${column}"]`);
    const source = this.cellSource(view, wrap, row, column);
    const component = components.get(wrap);
    if (!td || !source || !component) return;
    td.setText(source.text);
    td.contentEditable = 'true';
    td.addClass('it-editing');
    td.focus();
    const selection = activeWindow.getSelection();
    selection?.selectAllChildren(td);
    selection?.collapseToEnd();
    let done = false;
    const finish = (save: boolean, step = 0) => {
      if (done) return;
      done = true;
      td.contentEditable = 'false';
      td.removeClass('it-editing');
      const text = (td.textContent ?? '').replace(/\s*\n\s*/g, ' ').trim();
      const next = this.neighbor(wrap, row, column, step);
      if (save && text !== source.text) {
        if (next) pendingEdit = { from: source.tableFrom, ...next };
        const escaped = text.replace(/(?<!\\)\|/g, '\\|');
        view.dispatch({ changes: { from: source.from, to: source.to, insert: source.text ? escaped : ` ${escaped} ` } });
        return;
      }
      this.renderCell(td, source.text, component);
      if (next) this.editCell(view, wrap, next.row, next.column);
    };
    td.addEventListener('blur', () => finish(true), { once: true });
    td.addEventListener('keydown', event => {
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') finish(false);
      else if (event.key === 'Tab') finish(true, event.shiftKey ? -1 : 1);
      else return;
      event.preventDefault();
    });
  }

  /** Cell step cells away in reading order, undefined past either end. */
  private neighbor(wrap: HTMLElement, row: number, column: number, step: number) {
    if (step === 0) return undefined;
    const rows = wrap.querySelectorAll('tr');
    const columns = rows[0]?.children.length ?? 0;
    const index = row * columns + column + step;
    if (index < 0 || index >= rows.length * columns) return undefined;
    return { row: Math.floor(index / columns), column: index % columns };
  }
}

// Indented only: Obsidian renders top-level tables itself
function buildWidgets(state: EditorState, plugin: Plugin): DecorationSet {
  if (!state.field(editorLivePreviewField, false)) return Decoration.none;
  const { doc } = state;
  const sourcePath = state.field(editorInfoField, false)?.file?.path ?? '';
  const ranges: Range<Decoration>[] = [];
  for (const { start, end } of findTables(doc)) {
    const header = doc.line(start);
    if (!/^\s/.test(header.text)) continue;
    const from = header.from;
    const to = doc.line(end).to;
    const widget = new TableWidget(state.sliceDoc(from, to), from, plugin, sourcePath);
    ranges.push(Decoration.replace({ block: true, widget }).range(from, to));
  }
  return Decoration.set(ranges);
}

// Block widgets must come from a StateField, CM6 rejects them from a ViewPlugin
function widgetField(plugin: Plugin) {
  return StateField.define<DecorationSet>({
    create: state => buildWidgets(state, plugin),
    update: (value, transaction) => {
      const modeChanged = transaction.startState.field(editorLivePreviewField, false) !==
        transaction.state.field(editorLivePreviewField, false);
      return transaction.docChanged || modeChanged ? buildWidgets(transaction.state, plugin) : value;
    },
    provide: field => EditorView.decorations.from(field),
  });
}

export default class IndentedTable extends Plugin {
  onload() {
    this.registerEditorExtension([tablePlugin, widgetField(this)]);
  }
}
