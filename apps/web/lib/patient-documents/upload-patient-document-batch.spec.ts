import { describe, expect, it, vi } from 'vitest';

import { PatientDocumentUploadError } from './patient-document-upload-error';
import { uploadPatientDocumentBatch } from './upload-patient-document-batch';

function buildFile(name: string, type = 'application/pdf'): File {
  return new File(['x'], name, { type });
}

describe('uploadPatientDocumentBatch', () => {
  it('settles every file even when one in the middle fails', async () => {
    const uploadOne = vi.fn().mockImplementation(async ({ title }: { title: string }) => {
      if (title === 'two') {
        throw new PatientDocumentUploadError('confirm', new Error('content check failed'));
      }
      return { outcome: 'recorded' as const };
    });
    const onItemSettled = vi.fn();

    const results = await uploadPatientDocumentBatch({
      patientId: 'patient-1',
      items: [
        { file: buildFile('one.pdf'), title: 'one' },
        { file: buildFile('two.pdf'), title: 'two' },
        { file: buildFile('three.pdf'), title: 'three' },
      ],
      shared: { category: 'LAB_RESULT' },
      onItemSettled,
      uploadOne,
    });

    // Three attempts, three settlements, in pick order. The failure in the
    // middle neither stops the third file nor undoes the first.
    expect(uploadOne).toHaveBeenCalledTimes(3);
    expect(results.map((result) => result.outcome)).toEqual(['recorded', 'failed', 'recorded']);
    expect(results[1]?.error).toMatchObject({ stage: 'confirm' });
    expect(onItemSettled.mock.calls.map(([result]) => result.index)).toEqual([0, 1, 2]);
  });

  it('passes the shared fields to every file and the title per file', async () => {
    const uploadOne = vi.fn().mockResolvedValue({ outcome: 'recorded' });

    await uploadPatientDocumentBatch({
      patientId: 'patient-1',
      items: [
        { file: buildFile('a.pdf'), title: 'Page 1' },
        { file: buildFile('b.png', 'image/png'), title: 'Page 2' },
      ],
      shared: { category: 'RADIOLOGY', documentDate: '2026-08-01', admissionId: 'admission-1' },
      uploadOne,
    });

    expect(uploadOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        patientId: 'patient-1',
        title: 'Page 1',
        mimeType: 'application/pdf',
        category: 'RADIOLOGY',
        documentDate: '2026-08-01',
        admissionId: 'admission-1',
      }),
    );
    expect(uploadOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ title: 'Page 2', mimeType: 'image/png' }),
    );
  });

  it('routes progress to the file it belongs to', async () => {
    const uploadOne = vi.fn().mockImplementation(async ({ onProgress }) => {
      onProgress({ stage: 'uploading', percent: 50 });
      return { outcome: 'recorded' as const };
    });
    const onItemProgress = vi.fn();

    await uploadPatientDocumentBatch({
      patientId: 'patient-1',
      items: [
        { file: buildFile('a.pdf'), title: 'a' },
        { file: buildFile('b.pdf'), title: 'b' },
      ],
      shared: { category: 'OTHER' },
      onItemProgress,
      uploadOne,
    });

    expect(onItemProgress).toHaveBeenCalledWith(0, { stage: 'uploading', percent: 50 });
    expect(onItemProgress).toHaveBeenCalledWith(1, { stage: 'uploading', percent: 50 });
  });

  it('fails a file whose type the store does not accept without calling the API', async () => {
    const uploadOne = vi.fn();

    const results = await uploadPatientDocumentBatch({
      patientId: 'patient-1',
      items: [{ file: buildFile('archive.zip', 'application/zip'), title: 'zip' }],
      shared: { category: 'OTHER' },
      uploadOne,
    });

    expect(uploadOne).not.toHaveBeenCalled();
    expect(results[0]?.outcome).toBe('failed');
  });
});
