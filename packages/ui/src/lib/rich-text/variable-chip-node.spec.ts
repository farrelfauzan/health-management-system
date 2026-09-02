import { Editor, generateHTML, generateJSON } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';

import { buildRichTextEditorExtensions } from '#lib/rich-text/rich-text-editor-extensions';

const VARIABLES = [
  { token: 'patient.mrn', label: 'Nomor rekam medis' },
  { token: 'items', label: 'Rincian tagihan' },
] as const;

const extensions = buildRichTextEditorExtensions({ variables: VARIABLES });

let editor: Editor | null = null;

function createEditor(content: string): Editor {
  editor = new Editor({ element: document.createElement('div'), extensions, content });
  return editor;
}

function countChips(html: string): number {
  return (html.match(/data-hms-var=/g) ?? []).length;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('variable chip nodes', () => {
  it('inserts a scalar token as the empty canonical span with no label text', () => {
    // US-E1-03: the document holds the machine token, never the label.
    const instance = createEditor('<p>Nomor RM:</p>');
    instance.commands.focus('end');
    const didInsert = instance.commands.insertVariableChip({ token: 'patient.mrn' });
    expect(didInsert).toBe(true);
    expect(instance.getHTML()).toBe('<p>Nomor RM:<span data-hms-var="patient.mrn"></span></p>');
    expect(instance.getHTML()).not.toContain('Nomor rekam medis');
  });
  it('inserts a repeating token as the empty canonical div', () => {
    const instance = createEditor('<p>a</p>');
    instance.commands.focus('end');
    instance.commands.insertVariableBlock({ token: 'items' });
    expect(instance.getHTML()).toContain('<div data-hms-var="items"></div>');
    expect(instance.getHTML()).not.toContain('Rincian tagihan');
  });
  it('refuses to build a chip for a token outside the sanitiser grammar', () => {
    const instance = createEditor('<p>a</p>');
    expect(instance.commands.insertVariableChip({ token: 'Not A Token' })).toBe(false);
    expect(instance.commands.insertVariableChip({ token: 'a.b.c' })).toBe(false);
    expect(instance.getHTML()).toBe('<p>a</p>');
  });
  it('keeps the chip atomic when text is typed on either side of it', () => {
    const instance = createEditor('<p>a<span data-hms-var="patient.mrn"></span>b</p>');
    instance.commands.setTextSelection(2);
    instance.commands.insertContent('x');
    instance.commands.setTextSelection(4);
    instance.commands.insertContent('y');
    const html = instance.getHTML();
    expect(html).toBe('<p>ax<span data-hms-var="patient.mrn"></span>yb</p>');
    expect(countChips(html)).toBe(1);
  });
  it('removes the chip whole on Backspace instead of splitting it', () => {
    // ProseMirror's atom contract: the first Backspace selects the node as a
    // whole, the second deletes it — at no point is there a caret inside it.
    // prosemirror-view's `captureKeyDown` deletes the node before the caret
    // whole when it is not text (`stopNativeHorizontalDelete`); the model
    // guarantee behind that is exercised here: the chip is a leaf atom with
    // no interior position, so the only deletion that can touch it is its
    // own full range.
    const instance = createEditor('<p>a<span data-hms-var="patient.mrn"></span>b</p>');
    const chip = instance.state.doc.nodeAt(2);
    expect(chip?.type.name).toBe('variableChip');
    expect(chip?.isAtom).toBe(true);
    expect(chip?.isLeaf).toBe(true);
    expect(chip?.nodeSize).toBe(1);
    instance.commands.setTextSelection(3);
    expect(instance.commands.joinBackward()).toBe(false);
    expect(countChips(instance.getHTML())).toBe(1);
    instance.commands.deleteRange({ from: 2, to: 3 });
    expect(instance.getHTML()).toBe('<p>ab</p>');
  });
  it('round-trips sanitised HTML byte-for-byte (label re-materialised, not stored)', () => {
    const canonical =
      '<p>RM <span data-hms-var="patient.mrn"></span></p><div data-hms-var="items"></div>';
    const once = generateHTML(generateJSON(canonical, extensions), extensions);
    const twice = generateHTML(generateJSON(once, extensions), extensions);
    expect(once).toBe(canonical);
    expect(twice).toBe(canonical);
  });
  it('drops a chip whose token fails the grammar rather than keeping a broken element', () => {
    const html = generateHTML(
      generateJSON('<p><span data-hms-var="Bad Token">x</span></p>', extensions),
      extensions,
    );
    expect(html).not.toContain('data-hms-var');
  });
  it('still parses a token the registry does not know, so the editor can flag it', () => {
    const json = generateJSON('<p><span data-hms-var="patient.mrnTypo"></span></p>', extensions);
    const paragraph = json.content?.[0] as { content?: Array<{ type: string; attrs?: { token?: string } }> };
    expect(paragraph.content?.[0]?.type).toBe('variableChip');
    expect(paragraph.content?.[0]?.attrs?.token).toBe('patient.mrnTypo');
  });
});
