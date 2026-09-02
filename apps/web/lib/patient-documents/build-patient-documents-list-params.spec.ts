import { describe, expect, it } from 'vitest';

import { buildPatientDocumentsListParams } from './build-patient-documents-list-params';

describe('buildPatientDocumentsListParams', () => {
  it('sends nothing for an unfiltered list', () => {
    expect(buildPatientDocumentsListParams({})).toEqual({});
  });

  it('combines every set filter into one query', () => {
    expect(
      buildPatientDocumentsListParams({
        category: 'LAB_RESULT',
        documentDateFrom: '2026-03-01',
        documentDateTo: '2026-03-31',
      }),
    ).toEqual({
      category: 'LAB_RESULT',
      documentDateFrom: '2026-03-01',
      documentDateTo: '2026-03-31',
    });
  });

  it('drops a cleared date rather than sending an empty string', () => {
    // A cleared picker emits '', which the API's YYYY-MM-DD check would
    // reject; absent is what "no lower bound" looks like on the wire.
    expect(
      buildPatientDocumentsListParams({ category: 'RADIOLOGY', documentDateFrom: '' }),
    ).toEqual({ category: 'RADIOLOGY' });
  });
});
