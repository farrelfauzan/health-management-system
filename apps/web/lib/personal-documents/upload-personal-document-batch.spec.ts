import { describe, expect, it, vi } from 'vitest';

import { UnsupportedDocumentTypeError } from '#lib/documents/unsupported-document-type-error';
import { uploadPersonalDocumentBatch } from './upload-personal-document-batch';

function buildFile(name: string, type = 'application/pdf'): File {
  return new File(['x'], name, { type });
}

describe('uploadPersonalDocumentBatch', () => {
  it('settles every file even when one in the middle fails', async () => {
    const uploadOne = vi.fn().mockImplementation(async ({ title }: { title: string }) => {
      if (title === 'rusak.pdf') {
        throw new Error('content check failed');
      }
    });
    const onItemSettled = vi.fn();

    const results = await uploadPersonalDocumentBatch({
      items: [
        { file: buildFile('satu.pdf'), title: 'satu.pdf' },
        { file: buildFile('rusak.pdf'), title: 'rusak.pdf' },
        { file: buildFile('tiga.pdf'), title: 'tiga.pdf' },
      ],
      language: 'ID',
      onItemSettled,
      uploadOne,
    });

    // Three attempts, three settlements, in pick order. The failure in the
    // middle neither stops the third file nor undoes the first.
    expect(uploadOne).toHaveBeenCalledTimes(3);
    expect(results.map((result) => result.outcome)).toEqual(['recorded', 'failed', 'recorded']);
    expect(onItemSettled.mock.calls.map(([result]) => result.index)).toEqual([0, 1, 2]);
  });

  it('sends the batch language with every file and the filename as that file title', async () => {
    const uploadOne = vi.fn().mockResolvedValue(undefined);

    await uploadPersonalDocumentBatch({
      items: [
        { file: buildFile('panduan-hipertensi.pdf'), title: 'panduan-hipertensi.pdf' },
        { file: buildFile('formularium.md', 'text/markdown'), title: 'formularium.md' },
      ],
      language: 'EN',
      uploadOne,
    });

    expect(uploadOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        title: 'panduan-hipertensi.pdf',
        mimeType: 'application/pdf',
        language: 'EN',
      }),
    );
    expect(uploadOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: 'formularium.md',
        mimeType: 'text/markdown',
        language: 'EN',
      }),
    );
  });

  it('routes progress to the file it belongs to', async () => {
    const uploadOne = vi.fn().mockImplementation(async ({ onProgress }) => {
      onProgress({ stage: 'uploading', percent: 50 });
    });
    const onItemProgress = vi.fn();

    await uploadPersonalDocumentBatch({
      items: [
        { file: buildFile('a.pdf'), title: 'a.pdf' },
        { file: buildFile('b.pdf'), title: 'b.pdf' },
      ],
      language: 'ID',
      onItemProgress,
      uploadOne,
    });

    expect(onItemProgress).toHaveBeenCalledWith(0, { stage: 'uploading', percent: 50 });
    expect(onItemProgress).toHaveBeenCalledWith(1, { stage: 'uploading', percent: 50 });
  });

  it('fails a file whose type the store does not accept without calling the API', async () => {
    const uploadOne = vi.fn();

    const results = await uploadPersonalDocumentBatch({
      items: [{ file: buildFile('arsip.zip', 'application/zip'), title: 'arsip.zip' }],
      language: 'ID',
      uploadOne,
    });

    expect(uploadOne).not.toHaveBeenCalled();
    expect(results[0]?.outcome).toBe('failed');
    // A distinct class so the row can name the reason rather than say "the
    // upload failed" about a file that was never uploaded.
    expect(results[0]?.error).toBeInstanceOf(UnsupportedDocumentTypeError);
  });
});
