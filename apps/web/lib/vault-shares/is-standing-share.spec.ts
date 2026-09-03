import type { VaultDocumentShareView } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { isStandingShare } from './is-standing-share';

const NOW = new Date('2026-09-03T10:00:00.000Z');

function buildShare(overrides: Partial<VaultDocumentShareView> = {}): VaultDocumentShareView {
  return {
    id: 'share-1',
    documentId: 'document-1',
    granteeId: 'grantee-1',
    granteeEmail: 'admin@example.test',
    expiresAt: null,
    revokedAt: null,
    lastAccessedAt: null,
    openCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    isLive: true,
    ...overrides,
  };
}

describe('isStandingShare', () => {
  it('flags a live open-ended share older than ninety days', () => {
    expect(isStandingShare(buildShare(), NOW)).toBe(true);
  });

  it('does not flag a young open-ended share', () => {
    // A share made last week is a decision still fresh in its owner's mind.
    expect(isStandingShare(buildShare({ createdAt: '2026-08-28T00:00:00.000Z' }), NOW)).toBe(false);
  });

  it('does not flag a share that carries an expiry', () => {
    // Its owner already decided when it ends; there is nothing to remind them
    // about.
    expect(
      isStandingShare(
        buildShare({
          expiresAt: '2026-12-01T00:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it('does not flag a revoked share, however old', () => {
    expect(isStandingShare(buildShare({ isLive: false }), NOW)).toBe(false);
  });
});
