import { describe, expect, it } from 'vitest';

import { isFeatureEnabled } from './is-feature-enabled';

describe('isFeatureEnabled', () => {
  it('treats a claim set with no feature information as everything enabled', () => {
    expect(isFeatureEnabled({ roles: ['ADMIN'] }, 'ai-chatbot')).toBe(true);
  });

  it('treats a null claim set as everything enabled', () => {
    expect(isFeatureEnabled(null, 'ai-chatbot')).toBe(true);
  });

  it('reports a disabled key as off', () => {
    expect(isFeatureEnabled({ disabledFeatures: ['ai-chatbot'] }, 'ai-chatbot')).toBe(false);
  });

  it('does not confuse one disabled key for another', () => {
    expect(isFeatureEnabled({ disabledFeatures: ['billing'] }, 'ai-chatbot')).toBe(true);
  });
});
