import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
}

describe('PII audit regression sentinels', () => {
  it.each([
    ['auth/service/auth.service.ts', /metadata:\s*\{\s*email/],
    ['admin-management/service/admin-management.service.ts', /metadata:\s*\{[^}]*email/],
    ['patient-management/service/patient-management.service.ts', /metadata:\s*\{\s*mrn/],
    ['billing/service/billing.service.ts', /metadata:\s*\{[^}]*(invoiceNumber|reason)/],
  ])('keeps prohibited values out of %s audit metadata', (relativePath, sentinel) => {
    expect(readSource(`modules/${relativePath}`)).not.toMatch(sentinel);
  });

  /**
   * The chatbot is the one module that ships user text to a third party, so
   * the log surface around it is checked structurally rather than trusted.
   * Every assertion below is a leak that would be invisible in review: a
   * logger call that interpolated a prompt, a decrypted key, or a provider
   * payload reads exactly like one that logs a status code.
   */
  describe('AI chatbot log surface', () => {
    const CHATBOT_SOURCES = [
      'modules/ai-chatbot/service/ai-chatbot.service.ts',
      'modules/ai-chatbot/service/chat-context-enrichment.service.ts',
      'modules/ai-chatbot/service/safety-policy.service.ts',
      'modules/ai-chatbot/infrastructure/ai-provider-http.client.ts',
      'modules/ai-chatbot/controller/ai-chatbot-exception.filter.ts',
      'modules/ai-chatbot/repository/ai-provider-config.repository.ts',
      'modules/ai-chatbot/repository/chat.repository.ts',
    ] as const;

    it.each(CHATBOT_SOURCES)('keeps message and credential values out of %s logs', (source) => {
      const logCalls = readSource(source).match(/logger\.[a-z]+\([\s\S]*?\);/g) ?? [];
      for (const logCall of logCalls) {
        expect(logCall).not.toMatch(/content|prompt|message\.|\bapiKey\b|ciphertext|payload|body/i);
      }
    });

    it('never logs or returns a decrypted provider key', () => {
      const repositorySource = readSource(
        'modules/ai-chatbot/repository/ai-provider-config.repository.ts',
      );

      // revealApiKey feeds the connection object and nothing else; a second
      // consumer would be the moment a key could reach a log line.
      expect(repositorySource.match(/revealApiKey\(/g) ?? []).toHaveLength(3);
      expect(repositorySource).not.toContain('logger');
    });

    it('keeps the transcript out of the exception filter', () => {
      const filterSource = readSource('modules/ai-chatbot/controller/ai-chatbot-exception.filter.ts');

      expect(filterSource).not.toMatch(/exception\.(content|payload|prompt)/);
      // Only the typed code and request metadata are logged.
      expect(filterSource).toContain('errorCode: exception.code');
    });
  });

  it('keeps raw Prisma query and parameter event logging disabled', () => {
    const source = readSource('common/prisma/prisma.service.ts');

    expect(source).not.toContain("level: 'query'");
    expect(source).not.toContain("$on('query'");
    expect(source).not.toContain('event.params');
  });
});
