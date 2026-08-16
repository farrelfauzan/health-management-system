import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentUploadProgress } from '#lib/documents/upload-progress';

const createUploadUrlMock = vi.hoisted(() => vi.fn());
const confirmUploadMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  personalDocumentControllerCreateUploadUrlV1: createUploadUrlMock,
  personalDocumentControllerConfirmUploadV1: confirmUploadMock,
}));

/**
 * A scripted `XMLHttpRequest`: the PUT helper switched from `fetch` to XHR
 * because upload progress is the one capability `fetch` lacks, so the double
 * has to speak the same protocol — headers recorded, progress events fired,
 * then `onload` with a configurable status.
 */
class MockXmlHttpRequest {
  static instances: MockXmlHttpRequest[] = [];
  static nextStatus = 200;
  static progressEvents: Array<{ loaded: number; total: number }> = [];
  method = '';
  url = '';
  status = 0;
  sentBody: unknown = null;
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
  send(body: unknown): void {
    this.sentBody = body;
    queueMicrotask(() => {
      for (const event of MockXmlHttpRequest.progressEvents) {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: event.loaded,
          total: event.total,
        } as ProgressEvent);
      }
      this.status = MockXmlHttpRequest.nextStatus;
      this.onload?.();
    });
  }
}

vi.stubGlobal('XMLHttpRequest', MockXmlHttpRequest);

const { uploadPersonalDocument } = await import('./upload-personal-document');

const SIGNED = {
  status: 200,
  data: {
    data: {
      url: 'https://bucket.s3.ap-southeast-1.amazonaws.com/documents/doctor/abc.pdf?X-Amz-Signature=deadbeef',
      storageKey: 'documents/doctor/abc.pdf',
      requiredHeaders: { 'Content-Type': 'application/pdf', 'Content-Length': '11' },
    },
  },
};

function buildFile(): File {
  return new File(['hello world'], 'panduan.pdf', { type: 'application/pdf' });
}

async function runUpload(
  onProgress?: (progress: DocumentUploadProgress) => void,
): Promise<void> {
  await uploadPersonalDocument({
    file: buildFile(),
    title: 'Panduan',
    mimeType: 'application/pdf',
    language: 'ID',
    onProgress,
  });
}

describe('uploadPersonalDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockXmlHttpRequest.instances = [];
    MockXmlHttpRequest.nextStatus = 200;
    MockXmlHttpRequest.progressEvents = [];
    createUploadUrlMock.mockResolvedValue(SIGNED);
    confirmUploadMock.mockResolvedValue({ status: 201, data: { data: { id: 'doc-1' } } });
  });

  it('signs, PUTs to storage, then confirms with the server-minted key', async () => {
    await runUpload();

    expect(createUploadUrlMock).toHaveBeenCalledWith({
      mimeType: 'application/pdf',
      sizeBytes: 11,
    });
    const request = MockXmlHttpRequest.instances[0];
    expect(request?.method).toBe('PUT');
    expect(request?.url).toBe(SIGNED.data.data.url);
    // The key is passed through from the signing response, never constructed
    // here — the API refuses to record a key it did not issue.
    expect(confirmUploadMock).toHaveBeenCalledWith({
      storageKey: 'documents/doctor/abc.pdf',
      title: 'Panduan',
      language: 'ID',
    });
  });

  it('sends signed headers verbatim, no HMS credentials, no forbidden headers', async () => {
    await runUpload();

    const request = MockXmlHttpRequest.instances[0];
    // The signature covers content-type; a rewritten header is rejected by
    // the provider. Content-Length is a forbidden request header the browser
    // derives from the body itself — attempting to set it on XHR is an error,
    // and the body's real length is exactly what was signed.
    expect(request?.headers).toEqual({ 'Content-Type': 'application/pdf' });
    // An HMS bearer token must never travel to a third-party storage host.
    expect(JSON.stringify(request?.headers)).not.toMatch(/authorization/i);
  });

  it('narrates the stages in order with byte-accurate upload percentages', async () => {
    MockXmlHttpRequest.progressEvents = [
      { loaded: 4, total: 11 },
      { loaded: 11, total: 11 },
    ];
    const observed: DocumentUploadProgress[] = [];

    await runUpload((progress) => observed.push(progress));

    expect(observed).toEqual([
      { stage: 'preparing' },
      { stage: 'uploading', percent: 0 },
      { stage: 'uploading', percent: 36 },
      { stage: 'uploading', percent: 100 },
      { stage: 'uploading', percent: 100 },
      { stage: 'scanning' },
      { stage: 'complete' },
    ]);
  });

  it('does not confirm when storage rejects the PUT', async () => {
    MockXmlHttpRequest.nextStatus = 403;

    await expect(runUpload()).rejects.toThrow(/403/);
    // Confirming anyway would create a row pointing at an object that is not
    // there, and the document would sit in the list forever unanswerable.
    expect(confirmUploadMock).not.toHaveBeenCalled();
  });

  it('does not PUT when signing fails', async () => {
    createUploadUrlMock.mockResolvedValue({ status: 403, data: { error: { message: 'nope' } } });

    await expect(runUpload()).rejects.toThrow();
    expect(MockXmlHttpRequest.instances).toHaveLength(0);
    expect(confirmUploadMock).not.toHaveBeenCalled();
  });
});
