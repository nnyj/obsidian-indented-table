import { Plugin } from 'obsidian';
import { ViewPlugin, Decoration, EditorView, ViewUpdate, DecorationSet } from '@codemirror/view';
import { Range } from '@codemirror/state';

const RE_ROW = /^\s*\|(.+)\|\s*$/;
const RE_SEP = /^\s*\|[\s:|-]+\|\s*$/;

function pipeRange(line: { from: number; text: string }): [number, number] {
  const first = line.text.indexOf('|');
  const last = line.text.lastIndexOf('|');
  return [line.from + first, line.from + last + 1];
}

function buildDecorations(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const ranges: Range<Decoration>[] = [];

  let i = 1;
  while (i <= doc.lines) {
    const line = doc.line(i);
    if (!RE_ROW.test(line.text)) { i++; continue; }

    const start = i;
    let j = i + 1;
    while (j <= doc.lines && RE_ROW.test(doc.line(j).text)) j++;

    if (j - start >= 3 && RE_SEP.test(doc.line(start + 1).text)) {
      const sepNum = start + 1;
      const end = j - 1;

      const hdr = doc.line(start);
      const [hFrom, hTo] = pipeRange(hdr);
      ranges.push(Decoration.line({ class: 'it-nowrap' }).range(hdr.from));
      ranges.push(Decoration.mark({ class: 'it-header' }).range(hFrom, hTo));
      ranges.push(Decoration.line({ class: 'it-sep' }).range(doc.line(sepNum).from));

      for (let n = sepNum + 1; n <= end; n++) {
        const row = doc.line(n);
        const [rFrom, rTo] = pipeRange(row);
        ranges.push(Decoration.line({ class: 'it-nowrap' }).range(row.from));
        ranges.push(Decoration.mark({ class: 'it-row' }).range(rFrom, rTo));
      }

      for (let n = start; n <= end; n++) {
        if (n === sepNum) continue;
        const ln = doc.line(n);
        for (let c = 0; c < ln.text.length; c++) {
          if (ln.text[c] === '|')
            ranges.push(Decoration.mark({ class: 'it-pipe' }).range(ln.from + c, ln.from + c + 1));
        }
      }
    }

    i = j;
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

export default class IndentedTable extends Plugin {
  onload() {
    this.registerEditorExtension(tablePlugin);
  }
}
