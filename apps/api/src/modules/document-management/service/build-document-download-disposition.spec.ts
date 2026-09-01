import { DocumentRecord } from '@hms/shared-types';

import { buildDocumentDownloadDisposition } from './build-document-download-disposition';

function buildRecord(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
    ownerType: 'CLINIC',
    ownerId: null,
    purpose: 'FAQ_KNOWLEDGE_BASE',
    title: 'SOP Pendaftaran',
    storageKey: 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 184320,
    visibility: 'BOTH',
    language: 'ID',
    ingestStatus: 'READY',
    ingestError: null,
    ingestedAt: null,
    chunkCount: 3,
    uploadedById: 'a3c9b2e1-4d5f-4a6b-8c7d-9e0f1a2b3c4d',
    patientId: null,
    encounterId: null,
    admissionId: null,
    category: null,
    documentDate: null,
    notes: null,
    releasedToPatient: false,
    releasedAt: null,
    releasedById: null,
    deleteReason: null,
    createdAt: new Date('2026-08-03T09:00:00.000Z'),
    updatedAt: new Date('2026-08-03T09:00:00.000Z'),
    ...overrides,
  };
}

describe('buildDocumentDownloadDisposition', () => {
  it('always forces attachment with the title as the filename', () => {
    const actual = buildDocumentDownloadDisposition(buildRecord());

    expect(actual).toBe(
      `attachment; filename="SOP Pendaftaran.pdf"; filename*=UTF-8''SOP%20Pendaftaran.pdf`,
    );
  });

  it('neutralizes header-injection attempts in the title', () => {
    const actual = buildDocumentDownloadDisposition(
      buildRecord({ title: 'x"\r\nContent-Type: text/html;.exe' }),
    );

    expect(actual).not.toContain('\r');
    expect(actual).not.toContain('\n');
    expect(actual.startsWith('attachment; filename="')).toBe(true);
    const asciiFilename = actual.match(/filename="([^"]*)"/)?.[1] ?? '';
    expect(asciiFilename).not.toContain('"');
    expect(asciiFilename.endsWith('.pdf')).toBe(true);
  });

  it('keeps non-ASCII titles in the RFC 5987 half and a safe ASCII fallback', () => {
    const actual = buildDocumentDownloadDisposition(
      buildRecord({ title: 'Panduan – édisi 2026', mimeType: 'text/markdown' }),
    );

    expect(actual).toContain(`filename*=UTF-8''Panduan%20%E2%80%93%20%C3%A9disi%202026.md`);
    expect(actual).toContain('filename="Panduan disi 2026.md"');
  });

  it('falls back to a generic stem when the title has no safe characters', () => {
    const actual = buildDocumentDownloadDisposition(
      buildRecord({ title: '"""', mimeType: 'text/plain' }),
    );

    expect(actual).toContain('filename="document.txt"');
  });
});
