import { describe, expect, it } from 'vitest';

import { resolvePublishValidationDetails } from './resolve-publish-validation-details';

function buildAxiosError(data: unknown) {
  return { isAxiosError: true, response: { status: 422, data } };
}

describe('resolvePublishValidationDetails', () => {
  it('returns the unknown tokens from a refused publish envelope', () => {
    const actual = resolvePublishValidationDetails(
      buildAxiosError({
        error: {
          code: 'DOCUMENT_TEMPLATE_UNKNOWN_TOKENS',
          message: 'refused',
          details: { unknownTokens: ['patient.mrnTypo', 'foo.bar'] },
        },
      }),
    );
    expect(actual).toEqual({ unknownTokens: ['patient.mrnTypo', 'foo.bar'] });
  });
  it('returns null for another error code, a malformed detail, or a non-HTTP error', () => {
    expect(
      resolvePublishValidationDetails(
        buildAxiosError({ error: { code: 'CONFLICT', message: 'blank' } }),
      ),
    ).toBeNull();
    expect(
      resolvePublishValidationDetails(
        buildAxiosError({
          error: { code: 'DOCUMENT_TEMPLATE_UNKNOWN_TOKENS', details: { unknownTokens: [] } },
        }),
      ),
    ).toBeNull();
    expect(resolvePublishValidationDetails(new Error('network'))).toBeNull();
  });
});
