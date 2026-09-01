import { DocumentIngestionConfig, DocumentRecord } from '@hms/shared-types';

import { DocumentRepository } from '../repository/document.repository';
import { DocumentIngestionService } from './document-ingestion.service';
import { DocumentIngestionWorker } from './document-ingestion.worker';

function buildIngestionConfig(
  overrides: Partial<DocumentIngestionConfig> = {},
): DocumentIngestionConfig {
  return {
    isEnabled: true,
    pollIntervalMs: 15_000,
    pollBatchLimit: 3,
    maxChunkCharacters: 2_000,
    chunkOverlapCharacters: 200,
    maxChunksPerDocument: 400,
    ...overrides,
  };
}

function buildDocumentRecord(id: string): DocumentRecord {
  return {
    id,
    ownerType: 'CLINIC',
    ownerId: null,
    purpose: 'FAQ_KNOWLEDGE_BASE',
    title: 'SOP',
    storageKey: `documents/clinic/${id}.md`,
    mimeType: 'text/markdown',
    sizeBytes: 100,
    visibility: 'BOTH',
    language: 'ID',
    ingestStatus: 'PROCESSING',
    ingestError: null,
    ingestedAt: null,
    chunkCount: 0,
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
  };
}

describe('DocumentIngestionWorker', () => {
  let mockDocumentRepository: jest.Mocked<DocumentRepository>;
  let mockIngestionService: jest.Mocked<DocumentIngestionService>;

  function buildWorker(config = buildIngestionConfig()): DocumentIngestionWorker {
    Object.defineProperty(mockIngestionService, 'config', { value: config, configurable: true });
    return new DocumentIngestionWorker(mockDocumentRepository, mockIngestionService);
  }

  beforeEach(() => {
    mockDocumentRepository = {
      claimPendingDocuments: jest.fn(() => Promise.resolve([])),
    } as unknown as jest.Mocked<DocumentRepository>;
    mockIngestionService = {
      ingestDocument: jest.fn(() => Promise.resolve({} as never)),
    } as unknown as jest.Mocked<DocumentIngestionService>;
  });

  it('does not start a timer when ingestion is disabled', () => {
    const worker = buildWorker(buildIngestionConfig({ isEnabled: false }));
    const setIntervalSpy = jest.spyOn(global, 'setInterval');

    worker.onApplicationBootstrap();

    // Dev, CI, and any deployment without a reachable Ollama must boot with
    // no background loop failing every fifteen seconds.
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it('ingests every claimed document in a cycle', async () => {
    mockDocumentRepository.claimPendingDocuments.mockResolvedValue([
      buildDocumentRecord('11111111-1111-4111-8111-111111111111'),
      buildDocumentRecord('22222222-2222-4222-8222-222222222222'),
    ]);
    const worker = buildWorker();

    const actualProcessed = await worker.pollOnce();

    expect(actualProcessed).toBe(2);
    expect(mockIngestionService.ingestDocument).toHaveBeenCalledTimes(2);
  });

  it('claims no more than the configured batch limit', async () => {
    const worker = buildWorker(buildIngestionConfig({ pollBatchLimit: 5 }));

    await worker.pollOnce();

    expect(mockDocumentRepository.claimPendingDocuments).toHaveBeenCalledWith(5);
  });

  it('skips an overlapping cycle rather than queueing it', async () => {
    let releaseFirstClaim: (documents: DocumentRecord[]) => void = () => undefined;
    mockDocumentRepository.claimPendingDocuments.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseFirstClaim = resolve;
      }),
    );
    const worker = buildWorker();

    const firstCycle = worker.pollOnce();
    const actualSecondCycle = await worker.pollOnce();
    releaseFirstClaim([]);
    await firstCycle;

    // Embedding is slow enough that a backlog would otherwise start a second
    // pass over rows the first is still working through.
    expect(actualSecondCycle).toBe(0);
    expect(mockDocumentRepository.claimPendingDocuments).toHaveBeenCalledTimes(1);
  });

  it('survives a failed claim and releases the cycle lock', async () => {
    mockDocumentRepository.claimPendingDocuments
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce([buildDocumentRecord('33333333-3333-4333-8333-333333333333')]);
    const worker = buildWorker();

    const actualFailedCycle = await worker.pollOnce();
    const actualNextCycle = await worker.pollOnce();

    expect(actualFailedCycle).toBe(0);
    // A poller that stopped polling after one database blip would leave every
    // later upload stuck at PENDING with nothing saying why.
    expect(actualNextCycle).toBe(1);
  });

  it('stops its timer on shutdown', () => {
    const worker = buildWorker();
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    worker.onApplicationBootstrap();
    worker.onApplicationShutdown();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
