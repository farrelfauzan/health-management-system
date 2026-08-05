import { beforeEach, describe, expect, it, vi } from 'vitest';

const createUploadUrlMock = vi.hoisted(() => vi.fn());
const confirmUploadMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  personalDocumentControllerCreateUploadUrlV1: createUploadUrlMock,
  personalDocumentControllerConfirmUploadV1: confirmUploadMock,
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

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

async function runUpload(): Promise<void> {
  await uploadPersonalDocument({
    file: buildFile(),
    title: 'Panduan',
    mimeType: 'application/pdf',
    language: 'ID',
  });
}

describe('uploadPersonalDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createUploadUrlMock.mockResolvedValue(SIGNED);
    confirmUploadMock.mockResolvedValue({ status: 201, data: { data: { id: 'doc-1' } } });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  it('signs, PUTs to storage, then confirms with the server-minted key', async () => {
    await runUpload();

    expect(createUploadUrlMock).toHaveBeenCalledWith({
      mimeType: 'application/pdf',
      sizeBytes: 11,
    });
    expect(fetchMock).toHaveBeenCalledWith(SIGNED.data.data.url, expect.objectContaining({ method: 'PUT' }));
    // The key is passed through from the signing response, never constructed
    // here — the API refuses to record a key it did not issue.
    expect(confirmUploadMock).toHaveBeenCalledWith({
      storageKey: 'documents/doctor/abc.pdf',
      title: 'Panduan',
      language: 'ID',
    });
  });

  it('sends requiredHeaders verbatim and no HMS credentials', async () => {
    await runUpload();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/pdf', 'Content-Length': '11' });
    // The signature covers content-type; a rewritten header is rejected by the
    // provider. The absent one is the point of the second assertion: an HMS
    // bearer token must never travel to a third-party storage host.
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
  });

  it('does not confirm when storage rejects the PUT', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(runUpload()).rejects.toThrow(/403/);
    // Confirming anyway would create a row pointing at an object that is not
    // there, and the document would sit in the list forever unanswerable.
    expect(confirmUploadMock).not.toHaveBeenCalled();
  });

  it('does not PUT when signing fails', async () => {
    createUploadUrlMock.mockResolvedValue({ status: 403, data: { error: { message: 'nope' } } });

    await expect(runUpload()).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(confirmUploadMock).not.toHaveBeenCalled();
  });
});
