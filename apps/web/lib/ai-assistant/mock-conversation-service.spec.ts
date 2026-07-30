import { describe, expect, it } from 'vitest';

import { createMockConversationService } from './mock-conversation-service';

describe('createMockConversationService', () => {
  const service = createMockConversationService({ replyDelayMs: 0, locale: 'en' });

  it('builds a greeting addressed to the given display name', () => {
    const actualGreeting = service.buildGreeting({ displayName: 'Dr. Sarah' });

    expect(actualGreeting.paragraphs[0]).toContain('Hello Dr. Sarah.');
    expect(actualGreeting.references).toHaveLength(2);
  });

  it('returns the scripted reply keyed to a suggested prompt', async () => {
    const actualReply = await service.requestReply({
      text: "Summarize today's patient load.",
      promptId: 'patient-load',
    });

    expect(actualReply.paragraphs[0]).toContain('14 patients are scheduled');
    expect(actualReply.bullets).toContain(
      'High acuity: 3 patients (2 cardiology, 1 internal medicine).',
    );
  });

  it('falls back to the default reply for free-text messages', async () => {
    const actualReply = await service.requestReply({ text: 'Anything else?' });

    expect(actualReply.paragraphs[0]).toContain('mild hypokalemia');
    expect(actualReply.suggestionNote).toContain('This is an AI suggestion');
  });

  it('falls back to the default reply for an unknown prompt id', async () => {
    const actualReply = await service.requestReply({ text: 'Hi', promptId: 'unknown-prompt' });

    expect(actualReply.paragraphs[0]).toContain('mild hypokalemia');
  });
});
