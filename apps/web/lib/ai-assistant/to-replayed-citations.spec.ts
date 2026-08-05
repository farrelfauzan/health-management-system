import { describe, expect, it } from 'vitest';

import { toReplayedCitations } from './to-replayed-citations';

function buildRetrievalTurn(citations: unknown): string {
  return JSON.stringify({ promptBlock: '[1] Jam operasional klinik…', citations });
}

const CLINIC = {
  reference: 1,
  documentId: 'doc-clinic',
  title: 'SOP Jam Operasional',
  language: 'ID',
  sourceTier: 'CLINIC',
};

const PERSONAL = {
  reference: 2,
  documentId: 'doc-personal',
  title: 'Panduan Hipertensi',
  language: 'ID',
  sourceTier: 'PERSONAL',
};

describe('toReplayedCitations', () => {
  it('recovers citations with their tiers from a retrieval SYSTEM turn', () => {
    const actual = toReplayedCitations(buildRetrievalTurn([CLINIC, PERSONAL]));

    expect(actual?.map((citation) => citation.sourceTier)).toEqual(['CLINIC', 'PERSONAL']);
    expect(actual?.[0]?.title).toBe('SOP Jam Operasional');
  });

  it('ignores a tool-call SYSTEM turn', () => {
    // The three SYSTEM payloads are told apart by shape, not by a marker
    // column, so this is the discriminator doing its job.
    const toolTurn = JSON.stringify({
      toolName: 'get_queue_board_summary',
      outcome: 'SUCCESS',
      result: { waiting: 3 },
    });

    expect(toReplayedCitations(toolTurn)).toBeNull();
  });

  it('ignores a context-enrichment SYSTEM turn', () => {
    expect(toReplayedCitations(JSON.stringify({ role: 'DOCTOR', locale: 'id' }))).toBeNull();
  });

  it('ignores a retrieval turn that cited nothing', () => {
    expect(toReplayedCitations(buildRetrievalTurn([]))).toBeNull();
  });

  it('drops a malformed row rather than rendering a blank source', () => {
    const actual = toReplayedCitations(
      buildRetrievalTurn([CLINIC, { reference: 2, documentId: 'x' }]),
    );

    // A citation with no tier would render as "source unknown" beside a real
    // title, which is worse than it not appearing.
    expect(actual).toHaveLength(1);
    expect(actual?.[0]?.documentId).toBe('doc-clinic');
  });

  it('drops a row whose tier is not one the renderer knows', () => {
    const actual = toReplayedCitations(
      buildRetrievalTurn([{ ...CLINIC, sourceTier: 'SOMETHING_ELSE' }]),
    );

    expect(actual).toBeNull();
  });

  it('returns null for content that is not JSON', () => {
    expect(toReplayedCitations('not json at all')).toBeNull();
  });
});
