import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/**
 * A delivery-link token: 256 bits from the CSPRNG, base64url so it survives a
 * chat message and an address bar unchanged. The plaintext goes into the
 * message and nowhere else — only {@link hashDeliveryLinkToken} of it is
 * stored, the same bargain the invitation and OTP tables make.
 */
export function generateDeliveryLinkToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashDeliveryLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
