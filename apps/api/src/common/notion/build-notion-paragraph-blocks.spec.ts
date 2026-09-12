import { buildNotionParagraphBlocks } from './build-notion-paragraph-blocks';

const MAX_CHILD_BLOCKS = 100;

describe('buildNotionParagraphBlocks', () => {
  it('builds one paragraph per line', () => {
    const actualBlocks = buildNotionParagraphBlocks('baris satu\nbaris dua');
    expect(actualBlocks).toHaveLength(2);
    expect(actualBlocks[0]).toEqual({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: 'baris satu' } }] },
    });
  });

  it('keeps an empty line as an empty paragraph', () => {
    const actualBlocks = buildNotionParagraphBlocks('satu\n\ndua');
    expect(actualBlocks).toHaveLength(3);
    expect(actualBlocks[1]?.paragraph.rich_text).toEqual([]);
  });

  it('caps a request at the hundred children Notion accepts', () => {
    const inputText = Array.from({ length: 250 }, (unused, index) => `baris ${index}`).join('\n');
    const actualBlocks = buildNotionParagraphBlocks(inputText);
    expect(actualBlocks).toHaveLength(MAX_CHILD_BLOCKS);
  });

  it('says so in the last block when it truncates', () => {
    const inputText = Array.from({ length: 250 }, (unused, index) => `baris ${index}`).join('\n');
    const actualBlocks = buildNotionParagraphBlocks(inputText);
    expect(actualBlocks[MAX_CHILD_BLOCKS - 1]?.paragraph.rich_text[0]?.text.content).toContain(
      'too long',
    );
  });

  it('does not truncate at exactly the cap', () => {
    const inputText = Array.from({ length: MAX_CHILD_BLOCKS }, (unused, index) =>
      `baris ${index}`,
    ).join('\n');
    const actualBlocks = buildNotionParagraphBlocks(inputText);
    expect(actualBlocks).toHaveLength(MAX_CHILD_BLOCKS);
    expect(actualBlocks[MAX_CHILD_BLOCKS - 1]?.paragraph.rich_text[0]?.text.content).toBe(
      'baris 99',
    );
  });
});
