import { Logger } from '@nestjs/common';

import { RetrievedDocumentChunk } from '@hms/shared-types';

import { DocumentRetrievalService } from './document-retrieval.service';
import { FaqSearchService } from './faq-search.service';

describe('FaqSearchService', () => {
  let mockRetrievalService: jest.Mocked<Pick<DocumentRetrievalService, 'retrievePassages'>>;
  let faqSearchService: FaqSearchService;

  function buildPassage(overrides: Partial<RetrievedDocumentChunk> = {}): RetrievedDocumentChunk {
    return {
      chunkId: 'chunk-1',
      documentId: 'document-1',
      documentTitle: 'SOP Pendaftaran',
      chunkIndex: 0,
      content: 'Loket pendaftaran BPJS dibuka pukul 07.00.',
      language: 'ID',
      sourceTier: 'CLINIC',
      score: 0.031,
      ...overrides,
    };
  }

  beforeEach(() => {
    mockRetrievalService = { retrievePassages: jest.fn() };
    faqSearchService = new FaqSearchService(
      mockRetrievalService as unknown as DocumentRetrievalService,
    );
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('asks only for what an anonymous channel may read', async () => {
    mockRetrievalService.retrievePassages.mockResolvedValue([buildPassage()]);

    await faqSearchService.searchFaq('jam buka loket pendaftaran');

    // The load-bearing assertion of this service. Both values are constants
    // here rather than parameters, so a future tool registry cannot ask for
    // the staff-facing corpus or name an owner whose private documents would
    // join the candidate set.
    expect(mockRetrievalService.retrievePassages).toHaveBeenCalledWith({
      query: 'jam buka loket pendaftaran',
      channelVisibility: 'PATIENT',
      ownerUserId: null,
    });
  });

  it('returns the passage text and its document title, and nothing else', async () => {
    mockRetrievalService.retrievePassages.mockResolvedValue([buildPassage()]);

    const actualPassages = await faqSearchService.searchFaq('jam buka');

    // The §4.2 output allowlist enforced by projection rather than by the
    // caller remembering. Internal ids would let a customer-facing reply
    // correlate answers across conversations, and `score` is an RRF value a
    // model would happily present as a confidence percentage.
    expect(actualPassages).toEqual([
      {
        documentTitle: 'SOP Pendaftaran',
        content: 'Loket pendaftaran BPJS dibuka pukul 07.00.',
      },
    ]);
  });

  it('preserves the order retrieval ranked the passages in', async () => {
    mockRetrievalService.retrievePassages.mockResolvedValue([
      buildPassage({ chunkId: 'chunk-1', content: 'paling relevan' }),
      buildPassage({ chunkId: 'chunk-2', content: 'kurang relevan' }),
    ]);

    const actualPassages = await faqSearchService.searchFaq('pendaftaran');

    expect(actualPassages.map((passage) => passage.content)).toEqual([
      'paling relevan',
      'kurang relevan',
    ]);
  });

  it('returns nothing when the corpus has no answer', async () => {
    mockRetrievalService.retrievePassages.mockResolvedValue([]);

    await expect(faqSearchService.searchFaq('apakah klinik menjual mobil')).resolves.toEqual([]);
  });

  it('returns nothing rather than throwing when retrieval fails', async () => {
    mockRetrievalService.retrievePassages.mockRejectedValue(new Error('connect ECONNREFUSED'));

    // An unreachable embedder must degrade to "I don't have that written
    // down", not to an error on a customer's WhatsApp message.
    await expect(faqSearchService.searchFaq('jam buka')).resolves.toEqual([]);
  });

  it('never puts the question or the upstream message into the log payload', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    mockRetrievalService.retrievePassages.mockRejectedValue(
      new Error('embedding failed for "apakah saya positif HIV"'),
    );

    await faqSearchService.searchFaq('apakah saya positif HIV');

    const loggedLine = String(warnSpy.mock.calls[0]?.[0] ?? '');
    // On this channel the question belongs to a member of the public, and an
    // upstream error is free to quote it back. Only the error's name travels.
    expect(loggedLine).toContain('faq_search_failed');
    expect(loggedLine).not.toContain('HIV');
    expect(loggedLine).not.toContain('embedding failed');
  });
});
