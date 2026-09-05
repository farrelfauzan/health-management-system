import { DELIVERY_LINK_TOKEN_PATTERN } from '@hms/shared-types';

import { generateDeliveryLinkToken, hashDeliveryLinkToken } from './delivery-link-token';

describe('delivery link token', () => {
  it('generates a 43-character base64url token that the public route accepts', () => {
    const actual = generateDeliveryLinkToken();

    expect(actual).toMatch(DELIVERY_LINK_TOKEN_PATTERN);
  });

  it('generates a different token every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateDeliveryLinkToken()));

    expect(tokens.size).toBe(50);
  });

  it('hashes deterministically and never returns the token itself', () => {
    const token = generateDeliveryLinkToken();

    const actual = hashDeliveryLinkToken(token);

    expect(actual).toBe(hashDeliveryLinkToken(token));
    expect(actual).toHaveLength(64);
    expect(actual).not.toContain(token);
  });
});
