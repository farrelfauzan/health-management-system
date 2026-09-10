import { describe, expect, it, vi } from 'vitest';

import { UnsupportedDocumentTypeError } from '#lib/documents/unsupported-document-type-error';
import { uploadClinicDocumentBatch } from './upload-clinic-document-batch';

function buildFile(name: string, type = 'application/pdf'): File {
  return new File(['x'], name, { type });
}

describe('uploadClinicDocumentBatch', () => {
  it('settles every file even when one in the middle fails', async () => {
    const uploadOne = vi.fn().mockImplementation(async ({ title }: { title: string }) => {
      if (title === 'rusak.pdf') {
        throw new Error('content check failed');
      }
    });
    const onItemSettled = vi.fn();

    const results = await uploadClinicDocumentBatch({
      items: [
        { file: buildFile('satu.pdf'), title: 'satu.pdf' },
        { file: buildFile('rusak.pdf'), title: 'rusak.pdf' },
        { file: buildFile('tiga.pdf'), title: 'tiga.pdf' },
      ],
      purpose: 'FAQ_KNOWLEDGE_BASE',
      visibility: 'DOCTOR',
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

  it('sends the batch visibility, purpose and language with every file, under that file name', async () => {
    const uploadOne = vi.fn().mockResolvedValue(undefined);

    await uploadClinicDocumentBatch({
      items: [
        { file: buildFile('jam-buka.pdf'), title: 'jam-buka.pdf' },
        { file: buildFile('sop-eskalasi.md', 'text/markdown'), title: 'sop-eskalasi.md' },
      ],
      purpose: 'FAQ_KNOWLEDGE_BASE',
      visibility: 'BOTH',
      language: 'EN',
      uploadOne,
    });

    expect(uploadOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        title: 'jam-buka.pdf',
        mimeType: 'application/pdf',
        purpose: 'FAQ_KNOWLEDGE_BASE',
        visibility: 'BOTH',
        language: 'EN',
      }),
    );
    expect(uploadOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: 'sop-eskalasi.md',
        mimeType: 'text/markdown',
        purpose: 'FAQ_KNOWLEDGE_BASE',
        visibility: 'BOTH',
        language: 'EN',
      }),
    );
  });

  it('routes progress to the file it belongs to', async () => {
    const uploadOne = vi.fn().mockImplementation(async ({ onProgress }) => {
      onProgress({ stage: 'uploading', percent: 50 });
    });
    const onItemProgress = vi.fn();

    await uploadClinicDocumentBatch({
      items: [
        { file: buildFile('a.pdf'), title: 'a.pdf' },
        { file: buildFile('b.pdf'), title: 'b.pdf' },
      ],
      purpose: 'FAQ_KNOWLEDGE_BASE',
      visibility: 'DOCTOR',
      language: 'ID',
      onItemProgress,
      uploadOne,
    });

    expect(onItemProgress).toHaveBeenCalledWith(0, { stage: 'uploading', percent: 50 });
    expect(onItemProgress).toHaveBeenCalledWith(1, { stage: 'uploading', percent: 50 });
  });

  it('fails a file whose type the store does not accept without calling the API', async () => {
    const uploadOne = vi.fn();

    const results = await uploadClinicDocumentBatch({
      items: [{ file: buildFile('arsip.zip', 'application/zip'), title: 'arsip.zip' }],
      purpose: 'FAQ_KNOWLEDGE_BASE',
      visibility: 'DOCTOR',
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
