import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';

import { resolveDocumentTypeInUse } from './resolve-document-type-in-use';

function buildError(status: number, data: unknown): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: 'Conflict',
    headers: {},
    config: {},
    data,
  } as never);
}

describe('resolveDocumentTypeInUse', () => {
  it('returns the document count from the in-use refusal', () => {
    const inputError = buildError(409, {
      error: { code: 'DOCUMENT_TYPE_IN_USE', message: 'in use', details: { documentCount: 4 } },
    });

    expect(resolveDocumentTypeInUse(inputError)).toBe(4);
  });

  it('returns null for another 409, a non-409, or a non-axios error', () => {
    expect(
      resolveDocumentTypeInUse(
        buildError(409, { error: { code: 'DOCUMENT_TYPE_CODE_TAKEN', message: 'taken' } }),
      ),
    ).toBeNull();
    expect(
      resolveDocumentTypeInUse(
        buildError(403, { error: { code: 'DOCUMENT_TYPE_IN_USE', details: { documentCount: 1 } } }),
      ),
    ).toBeNull();
    expect(resolveDocumentTypeInUse(new Error('offline'))).toBeNull();
  });
});
