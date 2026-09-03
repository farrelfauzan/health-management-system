import { ConfigService } from '@nestjs/config';

import { DocumentRecord } from '@hms/shared-types';

import { EmbeddingService } from '../../../common/embedding/embedding.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { DocumentChunkRepository } from '../repository/document-chunk.repository';
import { DocumentRepository } from '../repository/document.repository';
import { DocumentIngestionService } from './document-ingestion.service';

const DOCUMENT_ID = '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11';

function buildDocumentRecord(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: DOCUMENT_ID,
    ownerType: 'CLINIC',
    ownerId: null,
    purpose: 'FAQ_KNOWLEDGE_BASE',
    title: 'SOP Pendaftaran',
    storageKey: 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.md',
    mimeType: 'text/markdown',
    sizeBytes: 4096,
    visibility: 'DOCTOR',
    language: 'ID',
    ingestStatus: 'PROCESSING',
    ingestError: null,
    ingestedAt: null,
    chunkCount: 0,
    uploadedById: 'a3c9b2e1-4d5f-4a6b-8c7d-9e0f1a2b3c4d',
    uploadedByEmail: null,
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

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    DOCUMENT_INGESTION_ENABLED: 'true',
    DOCUMENT_INGESTION_MAX_CHUNK_CHARACTERS: '100',
    DOCUMENT_INGESTION_CHUNK_OVERLAP_CHARACTERS: '10',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function buildStoredText(text: string) {
  return {
    key: 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.md',
    body: Buffer.from(text, 'utf8'),
    contentType: 'text/markdown',
  };
}

describe('DocumentIngestionService', () => {
  let mockDocumentRepository: jest.Mocked<DocumentRepository>;
  let mockChunkRepository: jest.Mocked<DocumentChunkRepository>;
  let mockObjectStorageService: jest.Mocked<ObjectStorageService>;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;

  function buildService(configService = buildConfigService()): DocumentIngestionService {
    return new DocumentIngestionService(
      configService,
      mockDocumentRepository,
      mockChunkRepository,
      mockObjectStorageService,
      mockEmbeddingService,
    );
  }

  beforeEach(() => {
    mockDocumentRepository = {
      markDocumentFailed: jest.fn((id: string, ingestError: string) =>
        Promise.resolve(buildDocumentRecord({ id, ingestStatus: 'FAILED', ingestError })),
      ),
    } as unknown as jest.Mocked<DocumentRepository>;
    mockChunkRepository = {
      replaceDocumentChunks: jest.fn(({ chunks }: { chunks: readonly unknown[] }) =>
        Promise.resolve(chunks.length),
      ),
    } as unknown as jest.Mocked<DocumentChunkRepository>;
    mockObjectStorageService = {
      getObject: jest.fn(() => Promise.resolve(buildStoredText('satu dua tiga'))),
    } as unknown as jest.Mocked<ObjectStorageService>;
    mockEmbeddingService = {
      model: 'bge-m3',
      version: '1',
      dimension: 3,
      embedTexts: jest.fn(({ texts }: { texts: readonly string[] }) =>
        Promise.resolve({
          embeddings: texts.map(() => [0.1, 0.2, 0.3]),
          model: 'bge-m3',
          version: '1',
          dimension: 3,
        }),
      ),
    } as unknown as jest.Mocked<EmbeddingService>;
  });

  it('stores one chunk per passage and reports READY', async () => {
    const actualResult = await buildService().ingestDocument(buildDocumentRecord());

    expect(actualResult).toEqual({
      documentId: DOCUMENT_ID,
      ingestStatus: 'READY',
      chunkCount: 1,
      ingestError: null,
    });
    expect(mockDocumentRepository.markDocumentFailed).not.toHaveBeenCalled();
  });

  it('stamps the embedding model and version on every chunk', async () => {
    await buildService().ingestDocument(buildDocumentRecord());

    // Without these, a model swap silently mixes incompatible vector spaces
    // and retrieval degrades with no error at all.
    const [call] = mockChunkRepository.replaceDocumentChunks.mock.calls;
    expect(call?.[0].chunks[0]).toMatchObject({ embeddingModel: 'bge-m3', embeddingVersion: '1' });
  });

  it('copies the parent visibility and language onto each chunk', async () => {
    await buildService().ingestDocument(
      buildDocumentRecord({ visibility: 'DOCTOR', language: 'EN' }),
    );

    // Retrieval filters over the chunk table in one pass, so a staff-only
    // document is only staff-only if its chunks say so.
    const [call] = mockChunkRepository.replaceDocumentChunks.mock.calls;
    expect(call?.[0].chunks[0]).toMatchObject({ visibility: 'DOCTOR', language: 'EN' });
  });

  it('numbers chunks in the order the passages appear', async () => {
    mockObjectStorageService.getObject.mockResolvedValue(
      buildStoredText([`${'a'.repeat(80)}`, `${'b'.repeat(80)}`, `${'c'.repeat(80)}`].join('\n\n')),
    );

    await buildService().ingestDocument(buildDocumentRecord());

    const [call] = mockChunkRepository.replaceDocumentChunks.mock.calls;
    expect(call?.[0].chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1, 2]);
  });

  it('fails a document whose file yields no text', async () => {
    // The common case: a scanned PDF with no text layer. A READY document
    // with zero chunks would claim to be searchable and answer nothing.
    mockObjectStorageService.getObject.mockResolvedValue(buildStoredText('   \n\n  '));

    const actualResult = await buildService().ingestDocument(buildDocumentRecord());

    expect(actualResult.ingestStatus).toBe('FAILED');
    expect(actualResult.ingestError).toBe('No text could be extracted from this document');
    expect(mockChunkRepository.replaceDocumentChunks).not.toHaveBeenCalled();
  });

  it('records an unreachable embedding host as its own reason', async () => {
    mockEmbeddingService.embedTexts.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const actualResult = await buildService().ingestDocument(buildDocumentRecord());

    expect(actualResult.ingestStatus).toBe('FAILED');
    expect(actualResult.ingestError).toBe('The embedding provider could not be reached');
  });

  it('never persists an upstream error message on the document row', async () => {
    // `ingestError` is readable by anyone who can list documents. A parser is
    // free to quote the bytes it choked on, so an unrecognized failure has to
    // become a category rather than a quotation.
    mockObjectStorageService.getObject.mockRejectedValue(
      new Error('Pasien Budi Santoso NIK 3201234567890001 — parse error at offset 42'),
    );

    const actualResult = await buildService().ingestDocument(buildDocumentRecord());

    expect(actualResult.ingestError).toBe('The stored file could not be read');
    expect(actualResult.ingestError).not.toMatch(/Budi|NIK|3201234567890001/);
  });

  it('refuses to ingest a document that is stored but never embedded', async () => {
    const actualResult = await buildService().ingestDocument(
      buildDocumentRecord({ purpose: 'GENERAL' }),
    );

    expect(actualResult.ingestStatus).toBe('FAILED');
    expect(actualResult.ingestError).toBe('Documents with purpose GENERAL are not ingested');
    expect(mockObjectStorageService.getObject).not.toHaveBeenCalled();
  });

  it('fails rather than mispairing when the provider returns the wrong number of vectors', async () => {
    mockObjectStorageService.getObject.mockResolvedValue(
      buildStoredText([`${'a'.repeat(80)}`, `${'b'.repeat(80)}`].join('\n\n')),
    );
    mockEmbeddingService.embedTexts.mockResolvedValue({
      embeddings: [[0.1, 0.2, 0.3]],
      model: 'bge-m3',
      version: '1',
      dimension: 3,
    });

    const actualResult = await buildService().ingestDocument(buildDocumentRecord());

    // Silently pairing chunk 1 with chunk 0's vector would attach every
    // passage's text to a neighbour's meaning, undetectably.
    expect(actualResult.ingestStatus).toBe('FAILED');
    expect(actualResult.ingestError).toBe(
      'The embedding provider returned a mismatched vector count',
    );
    expect(mockChunkRepository.replaceDocumentChunks).not.toHaveBeenCalled();
  });

  it('caps a document that produces more chunks than the configured ceiling', async () => {
    const paragraphs = Array.from({ length: 10 }, (_unused, index) => `${index}`.repeat(80)).join(
      '\n\n',
    );
    mockObjectStorageService.getObject.mockResolvedValue(buildStoredText(paragraphs));
    const service = buildService(
      buildConfigService({ DOCUMENT_INGESTION_MAX_CHUNKS_PER_DOCUMENT: '4' }),
    );

    const actualResult = await service.ingestDocument(buildDocumentRecord());

    expect(actualResult.chunkCount).toBe(4);
  });

  it('refuses a configuration whose overlap is not smaller than the chunk size', () => {
    expect(() =>
      buildService(
        buildConfigService({
          DOCUMENT_INGESTION_MAX_CHUNK_CHARACTERS: '100',
          DOCUMENT_INGESTION_CHUNK_OVERLAP_CHARACTERS: '100',
        }),
      ),
    ).toThrow(/must be smaller than/);
  });
});
