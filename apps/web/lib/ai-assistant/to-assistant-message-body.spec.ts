import { describe, expect, it } from 'vitest';

import { toAssistantMessageBody } from './to-assistant-message-body';

const CITATIONS = [
  {
    reference: 1,
    documentId: 'doc-clinic',
    title: 'SOP Alur Pendaftaran',
    language: 'ID' as const,
    sourceTier: 'CLINIC' as const,
  },
  {
    reference: 2,
    documentId: 'doc-personal',
    title: 'Panduan Hipertensi',
    language: 'ID' as const,
    sourceTier: 'PERSONAL' as const,
  },
];

describe('toAssistantMessageBody citations', () => {
  it('carries citations through from the response meta with their tiers intact', () => {
    const actual = toAssistantMessageBody('Menurut panduan [1] dan [2].', {
      citations: CITATIONS,
    } as never);

    expect(actual.citations).toHaveLength(2);
    expect(actual.citations?.map((citation) => citation.sourceTier)).toEqual([
      'CLINIC',
      'PERSONAL',
    ]);
  });

  it('omits the field entirely when the reply was not grounded', () => {
    const actual = toAssistantMessageBody('Halo.', {} as never);

    // Absent rather than an empty array: the renderer checks presence, and an
    // empty list would render a "grounded in" heading with nothing under it.
    expect(actual.citations).toBeUndefined();
  });

  it('omits the field when retrieval returned nothing', () => {
    const actual = toAssistantMessageBody('Halo.', { citations: [] } as never);

    expect(actual.citations).toBeUndefined();
  });

  it('leaves the reply text untouched', () => {
    const actual = toAssistantMessageBody('Menurut panduan [1].', { citations: CITATIONS } as never);

    // The [n] markers stay in the prose exactly as the model wrote them; the
    // citation list resolves them, it does not rewrite them.
    expect(actual.paragraphs).toEqual(['Menurut panduan [1].']);
  });
});
