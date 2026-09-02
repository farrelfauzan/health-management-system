import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentUploadProgress } from '#lib/documents/upload-progress';

const createUploadUrlMock = vi.hoisted(() => vi.fn());
const confirmUploadMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  patientDocumentControllerCreateUploadUrlV1: createUploadUrlMock,
  patientDocumentControllerConfirmUploadV1: confirmUploadMock,
}));

/**
 * A scripted `XMLHttpRequest`, the same double the personal-document spec
 * uses: the PUT helper speaks XHR for upload progress, so the double records
 * headers, fires progress events, then `onload`s with the next queued status.
 */
class MockXmlHttpRequest {
  static instances: MockXmlHttpRequest[] = [];
  static statusQueue: number[] = [];
  method = '';
  url = '';
  status = 0;
  headers: Record<string, string> = {};
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    MockXmlHttpRequest.instances.push(this);
  }
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  send(): void {
    queueMicrotask(() => {
      this.status = MockXmlHttpRequest.statusQueue.shift() ?? 200;
      this.onload?.();
    });
  }
}

vi.stubGlobal('XMLHttpRequest', MockXmlHttpRequest);

const { uploadPatientDocument } = await import('./upload-patient-document');
const { PatientDocumentUploadError } = await import('./patient-document-upload-error');

function buildSigned(storageKey: string): { status: number; data: unknown } {
  return {
    status: 200,
    data: {
      data: {
        url: `https://bucket.s3.ap-southeast-1.amazonaws.com/${storageKey}?X-Amz-Signature=deadbeef`,
        storageKey,
        expiresAt: '2026-09-02T09:00:00.000Z',
        requiredHeaders: { 'Content-Type': 'application/pdf' },
      },
    },
  };
}

function buildConflictError(): AxiosError {
  return new AxiosError('Request failed with status code 409', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 409,
    statusText: 'Conflict',
    headers: {},
    config: {},
    data: { error: { code: 'CONFLICT', message: 'Document already recorded' } },
  } as AxiosResponse);
}

function buildFile(): File {
  return new File(['hello world'], 'hasil-lab.pdf', { type: 'application/pdf' });
}

async function runUpload(onProgress?: (progress: DocumentUploadProgress) => void) {
  return uploadPatientDocument({
    patientId: 'patient-1',
    file: buildFile(),
    mimeType: 'application/pdf',
    title: 'Hasil Lab',
    category: 'LAB_RESULT',
    documentDate: '2026-08-30',
    encounterId: 'encounter-1',
    onProgress,
  });
}

describe('uploadPatientDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockXmlHttpRequest.instances = [];
    MockXmlHttpRequest.statusQueue = [];
    createUploadUrlMock.mockResolvedValue(buildSigned('documents/patient/one.pdf'));
    confirmUploadMock.mockResolvedValue({ status: 201, data: { data: { id: 'doc-1' } } });
  });

  it('signs against the patient route, PUTs, then confirms with the server-minted key', async () => {
    const result = await runUpload();

    expect(result).toEqual({ outcome: 'recorded' });
    expect(createUploadUrlMock).toHaveBeenCalledWith('patient-1', {
      mimeType: 'application/pdf',
      sizeBytes: 11,
    });
    expect(MockXmlHttpRequest.instances[0]?.method).toBe('PUT');
    // The key is passed through untouched, and only the fields that were
    // set travel — an absent notes field must not arrive as `undefined`.
    expect(confirmUploadMock).toHaveBeenCalledWith('patient-1', {
      storageKey: 'documents/patient/one.pdf',
      title: 'Hasil Lab',
      category: 'LAB_RESULT',
      documentDate: '2026-08-30',
      encounterId: 'encounter-1',
    });
  });

  it('retries a storage rejection once with a freshly signed URL', async () => {
    MockXmlHttpRequest.statusQueue = [403, 200];
    createUploadUrlMock
      .mockResolvedValueOnce(buildSigned('documents/patient/first.pdf'))
      .mockResolvedValueOnce(buildSigned('documents/patient/second.pdf'));

    const result = await runUpload();

    expect(result).toEqual({ outcome: 'recorded' });
    // Two signatures, two PUTs, and the confirm names the second key: the
    // first URL is never reused, and nothing was recorded under it.
    expect(createUploadUrlMock).toHaveBeenCalledTimes(2);
    expect(MockXmlHttpRequest.instances).toHaveLength(2);
    expect(MockXmlHttpRequest.instances[1]?.url).toContain('second.pdf');
    expect(confirmUploadMock).toHaveBeenCalledWith(
      'patient-1',
      expect.objectContaining({ storageKey: 'documents/patient/second.pdf' }),
    );
  });

  it('gives up after the second storage rejection without confirming', async () => {
    MockXmlHttpRequest.statusQueue = [403, 403];

    await expect(runUpload()).rejects.toMatchObject({ stage: 'put' });
    expect(confirmUploadMock).not.toHaveBeenCalled();
  });

  it('treats a 409 on confirm as already recorded', async () => {
    confirmUploadMock.mockRejectedValue(buildConflictError());

    const result = await runUpload();

    // The row exists; asking the person to upload again would be a lie.
    expect(result).toEqual({ outcome: 'already-recorded' });
  });

  it('names the confirm stage when the row could not be recorded', async () => {
    confirmUploadMock.mockResolvedValue({
      status: 422,
      data: { error: { code: 'UNPROCESSABLE', message: 'Object failed content checks' } },
    });

    const error = await runUpload().catch((err: unknown) => err);

    // The dialog turns this stage into "remove it and pick it again" — the
    // bytes are in storage and nothing names them.
    expect(error).toBeInstanceOf(PatientDocumentUploadError);
    expect(error).toMatchObject({ stage: 'confirm', message: 'Object failed content checks' });
  });

  it('does not PUT when signing fails', async () => {
    createUploadUrlMock.mockResolvedValue({ status: 403, data: { error: { message: 'nope' } } });

    await expect(runUpload()).rejects.toMatchObject({ stage: 'sign' });
    expect(MockXmlHttpRequest.instances).toHaveLength(0);
    expect(confirmUploadMock).not.toHaveBeenCalled();
  });

  it('narrates the stages in order', async () => {
    const observed: DocumentUploadProgress[] = [];

    await runUpload((progress) => observed.push(progress));

    expect(observed.map((progress) => progress.stage)).toEqual([
      'preparing',
      'uploading',
      'uploading',
      'scanning',
      'complete',
    ]);
  });
});
