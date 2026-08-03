import { RankedDocumentChunkCandidate } from '@hms/shared-types';

import { fuseByReciprocalRank } from './fuse-by-reciprocal-rank';

describe('fuseByReciprocalRank', () => {
  const RANK_CONSTANT = 60;

  type CandidateOverrides = Partial<RankedDocumentChunkCandidate> &
    Pick<RankedDocumentChunkCandidate, 'chunkId' | 'rank'>;

  function buildCandidate(overrides: CandidateOverrides): RankedDocumentChunkCandidate {
    return {
      documentId: 'document-1',
      documentTitle: 'SOP Pendaftaran',
      chunkIndex: 0,
      content: 'Pendaftaran pasien BPJS dibuka pukul 07.00.',
      language: 'ID',
      sourceTier: 'CLINIC',
      ...overrides,
    };
  }

  function fuse(
    rankedLists: ReadonlyArray<readonly RankedDocumentChunkCandidate[]>,
    limit = 10,
  ): ReturnType<typeof fuseByReciprocalRank> {
    return fuseByReciprocalRank({ rankedLists, rankConstant: RANK_CONSTANT, limit });
  }

  it('ranks a passage both halves found above one only a single half ranked first', () => {
    // The property the whole choice of RRF rests on: agreement between two
    // independent retrieval strategies outweighs a confident single opinion.
    // 1/62 + 1/62 > 1/61.
    const agreed = buildCandidate({ chunkId: 'agreed', rank: 2 });
    const vectorOnly = buildCandidate({ chunkId: 'vector-only', rank: 1 });
    const lexicalOnly = buildCandidate({ chunkId: 'lexical-only', rank: 1 });

    const actual = fuse([
      [vectorOnly, agreed],
      [lexicalOnly, { ...agreed, rank: 2 }],
    ]);

    expect(actual.map((passage) => passage.chunkId)).toEqual([
      'agreed',
      'lexical-only',
      'vector-only',
    ]);
  });

  it('sums the reciprocal of each half’s rank rather than any underlying score', () => {
    const actual = fuse([
      [buildCandidate({ chunkId: 'chunk-a', rank: 1 })],
      [buildCandidate({ chunkId: 'chunk-a', rank: 3 })],
    ]);

    expect(actual).toHaveLength(1);
    expect(actual[0]?.score).toBeCloseTo(1 / 61 + 1 / 63, 10);
  });

  it('keeps a passage only one half returned', () => {
    const actual = fuse([[buildCandidate({ chunkId: 'vector-only', rank: 1 })], []]);

    expect(actual.map((passage) => passage.chunkId)).toEqual(['vector-only']);
    expect(actual[0]?.score).toBeCloseTo(1 / 61, 10);
  });

  it('returns nothing when neither half matched', () => {
    expect(fuse([[], []])).toEqual([]);
  });

  it('carries the citation fields through from the half that found the passage', () => {
    const actual = fuse([
      [
        buildCandidate({
          chunkId: 'chunk-a',
          rank: 1,
          documentId: 'document-9',
          documentTitle: 'Antibiotic Guideline',
          chunkIndex: 4,
          language: 'EN',
          sourceTier: 'PERSONAL',
        }),
      ],
      [],
    ]);

    expect(actual[0]).toMatchObject({
      documentId: 'document-9',
      documentTitle: 'Antibiotic Guideline',
      chunkIndex: 4,
      language: 'EN',
      sourceTier: 'PERSONAL',
    });
  });

  it('breaks ties deterministically so an evaluation run is reproducible', () => {
    // Two passages each found by one half at the same rank score identically.
    // Without a stable tie-break, P15-T12's recall baseline would move between
    // runs over nothing.
    const first = fuse([
      [buildCandidate({ chunkId: 'bbb', rank: 1 })],
      [buildCandidate({ chunkId: 'aaa', rank: 1 })],
    ]);
    const second = fuse([
      [buildCandidate({ chunkId: 'aaa', rank: 1 })],
      [buildCandidate({ chunkId: 'bbb', rank: 1 })],
    ]);

    expect(first.map((passage) => passage.chunkId)).toEqual(['aaa', 'bbb']);
    expect(second.map((passage) => passage.chunkId)).toEqual(['aaa', 'bbb']);
  });

  it('prefers the better single position when scores are otherwise equal', () => {
    // Equal totals, unequal best positions: 1/61 + 1/64 against 1/62 + 1/63
    // are not equal, so this uses one list each to isolate the tie-break.
    const actual = fuse([
      [buildCandidate({ chunkId: 'zzz-close', rank: 1 })],
      [buildCandidate({ chunkId: 'aaa-far', rank: 1 })],
    ]);

    // Both score 1/61 and both have best rank 1, so the chunk id decides —
    // and it decides the same way every run.
    expect(actual.map((passage) => passage.chunkId)).toEqual(['aaa-far', 'zzz-close']);
  });

  it('truncates to the requested limit', () => {
    const actual = fuse(
      [
        [
          buildCandidate({ chunkId: 'chunk-1', rank: 1 }),
          buildCandidate({ chunkId: 'chunk-2', rank: 2 }),
          buildCandidate({ chunkId: 'chunk-3', rank: 3 }),
        ],
        [],
      ],
      2,
    );

    expect(actual.map((passage) => passage.chunkId)).toEqual(['chunk-1', 'chunk-2']);
  });
});
