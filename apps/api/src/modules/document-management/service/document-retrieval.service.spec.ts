import { ConfigService } from '@nestjs/config';

import { RankedDocumentChunkCandidate, RetrieveDocumentChunksParams } from '@hms/shared-types';

import { EmbeddingService } from '../../../common/embedding/embedding.service';
import { DocumentRetrievalRepository } from '../repository/document-retrieval.repository';
import { DocumentRetrievalService } from './document-retrieval.service';

describe('DocumentRetrievalService', () => {
  const embedTextsMock = jest.fn();
  const searchByVectorMock = jest.fn();
  const searchByFullTextMock = jest.fn();

  const QUERY_VECTOR = [0.1, 0.2, 0.3];

  function buildService(env: Record<string, string> = {}): DocumentRetrievalService {
    return new DocumentRetrievalService(
      new ConfigService(env),
      {
        model: 'bge-m3',
        version: '1',
        dimension: 1024,
        embedTexts: embedTextsMock,
      } as unknown as EmbeddingService,
      {
        searchByVector: searchByVectorMock,
        searchByFullText: searchByFullTextMock,
      } as unknown as DocumentRetrievalRepository,
    );
  }

  function buildCandidate(
    chunkId: string,
    rank: number,
    overrides: Partial<RankedDocumentChunkCandidate> = {},
  ): RankedDocumentChunkCandidate {
    return {
      chunkId,
      documentId: `document-${chunkId}`,
      documentTitle: 'SOP Pendaftaran',
      chunkIndex: 0,
      content: 'Pendaftaran pasien BPJS dibuka pukul 07.00 di poliklinik umum setiap hari kerja.',
      language: 'ID',
      sourceTier: 'CLINIC',
      rank,
      ...overrides,
    };
  }

  function readVectorSearchParams(): RetrieveDocumentChunksParams {
    return searchByVectorMock.mock.calls[0]?.[0] as RetrieveDocumentChunksParams;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    embedTextsMock.mockResolvedValue({
      embeddings: [QUERY_VECTOR],
      model: 'bge-m3',
      version: '1',
      dimension: 1024,
    });
    searchByVectorMock.mockResolvedValue([]);
    searchByFullTextMock.mockResolvedValue([]);
  });

  it('runs both halves over one candidate set and fuses them', async () => {
    searchByVectorMock.mockResolvedValue([buildCandidate('semantic', 1), buildCandidate('both', 2)]);
    searchByFullTextMock.mockResolvedValue([
      buildCandidate('lexical', 1),
      buildCandidate('both', 2),
    ]);

    const actual = await buildService().retrievePassages({
      query: 'Kapan pendaftaran BPJS dibuka?',
      channelVisibility: 'PATIENT',
      ownerUserId: null,
    });

    expect(actual.map((passage) => passage.chunkId)).toEqual(['both', 'lexical', 'semantic']);
    // Both halves must see identical scope arguments — a divergence would let
    // the lexical query reach a document the vector query could not.
    expect(searchByFullTextMock.mock.calls[0]?.[0]).toEqual(readVectorSearchParams());
  });

  it('embeds the question with the model that embedded the chunks and matches on it', async () => {
    embedTextsMock.mockResolvedValue({
      embeddings: [QUERY_VECTOR],
      model: 'multilingual-e5-large',
      version: '3',
      dimension: 1024,
    });

    await buildService().retrievePassages({
      query: 'chest pain triage',
      channelVisibility: 'DOCTOR',
      ownerUserId: 'doctor-1',
    });

    // The model and version travel from the embedder into the query rather
    // than from configuration read twice: comparing a question embedded by
    // one model against chunks embedded by another returns confident nonsense.
    expect(readVectorSearchParams()).toMatchObject({
      queryEmbedding: QUERY_VECTOR,
      embeddingModel: 'multilingual-e5-large',
      embeddingVersion: '3',
      queryText: 'chest pain triage',
    });
  });

  it('passes the asking user as the owner so their own corpus joins the union', async () => {
    await buildService().retrievePassages({
      query: 'formularium antibiotik',
      channelVisibility: 'DOCTOR',
      ownerUserId: 'doctor-1',
    });

    expect(readVectorSearchParams()).toMatchObject({
      channelVisibility: 'DOCTOR',
      ownerUserId: 'doctor-1',
    });
  });

  it('passes no owner for a channel with no personal corpus', async () => {
    await buildService().retrievePassages({
      query: 'jam buka klinik',
      channelVisibility: 'PATIENT',
      ownerUserId: null,
    });

    expect(readVectorSearchParams()).toMatchObject({
      channelVisibility: 'PATIENT',
      ownerUserId: null,
    });
  });

  it('caps the fused result at the configured passage limit', async () => {
    searchByVectorMock.mockResolvedValue([
      buildCandidate('chunk-1', 1),
      buildCandidate('chunk-2', 2),
      buildCandidate('chunk-3', 3),
    ]);

    const actual = await buildService({ DOCUMENT_RETRIEVAL_MAX_PASSAGES: '2' }).retrievePassages({
      query: 'jam buka klinik',
      channelVisibility: 'PATIENT',
      ownerUserId: null,
    });

    expect(actual.map((passage) => passage.chunkId)).toEqual(['chunk-1', 'chunk-2']);
  });

  it('drops scraps too short to ground anything, and promotes a real passage in their place', async () => {
    searchByVectorMock.mockResolvedValue([
      buildCandidate('heading', 1, { content: 'BAB II' }),
      buildCandidate('page-number', 2, { content: '  12  ' }),
      buildCandidate('substantive', 3),
    ]);

    const actual = await buildService({
      DOCUMENT_RETRIEVAL_MAX_PASSAGES: '2',
    }).retrievePassages({
      query: 'jam buka klinik',
      channelVisibility: 'PATIENT',
      ownerUserId: null,
    });

    expect(actual.map((passage) => passage.chunkId)).toEqual(['substantive']);
  });

  it('returns nothing for a blank question without touching the embedder', async () => {
    const actual = await buildService().retrievePassages({
      query: '   ',
      channelVisibility: 'PATIENT',
      ownerUserId: null,
    });

    expect(actual).toEqual([]);
    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(searchByVectorMock).not.toHaveBeenCalled();
  });

  it('refuses to search rather than degrading to lexical-only when the embedder is unreachable', async () => {
    // Half a hybrid still answers confidently, and it does so with the
    // cross-lingual half silently switched off — the "reads as the feature
    // getting worse" failure §5.4 is written to avoid. The caller turns this
    // into an ungrounded answer, which is visible.
    embedTextsMock.mockRejectedValue(new Error('Embedding provider is unreachable'));

    await expect(
      buildService().retrievePassages({
        query: 'jam buka klinik',
        channelVisibility: 'PATIENT',
        ownerUserId: null,
      }),
    ).rejects.toThrow('Embedding provider is unreachable');
    expect(searchByFullTextMock).not.toHaveBeenCalled();
  });

  it('refuses a configuration asking for more passages than either half may return', () => {
    expect(() =>
      buildService({
        DOCUMENT_RETRIEVAL_CANDIDATE_LIMIT: '3',
        DOCUMENT_RETRIEVAL_MAX_PASSAGES: '5',
      }),
    ).toThrow('DOCUMENT_RETRIEVAL_MAX_PASSAGES must not exceed DOCUMENT_RETRIEVAL_CANDIDATE_LIMIT');
  });
});
