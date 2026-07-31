/**
 * Canonical examples for the AI provider configuration endpoints, mirrored by
 * `ApiEndpoint` into the OpenAPI document. The API key is write-only: the
 * request example carries one, response examples only ever show the presence
 * flag and the four-character hint. All values are synthetic.
 */
export const AI_CHATBOT_EXAMPLES = {
  configView: {
    id: '8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    providerKind: 'DEEPSEEK',
    displayName: 'Clinic DeepSeek',
    hasApiKey: true,
    apiKeyHint: 'x7Kp',
    baseUrl: null,
    defaultModel: 'deepseek-chat',
    isActive: true,
    isEnabled: true,
    maxTokens: 2048,
    timeoutMs: 30000,
    lastTestedAt: '2026-08-12T04:20:00.000Z',
    lastTestResult: 'OK: Provider accepted the credentials and answered with model deepseek-chat',
    createdAt: '2026-08-12T04:00:00.000Z',
    updatedAt: '2026-08-12T04:20:00.000Z',
  },
  stagedConfigView: {
    id: '5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e',
    providerKind: 'OLLAMA',
    displayName: 'Clinic Ollama (staged)',
    hasApiKey: false,
    apiKeyHint: '',
    baseUrl: 'http://ollama.internal:11434/v1',
    defaultModel: 'llama3.2',
    isActive: false,
    isEnabled: true,
    maxTokens: 2048,
    timeoutMs: 30000,
    lastTestedAt: null,
    lastTestResult: null,
    createdAt: '2026-08-12T05:00:00.000Z',
    updatedAt: '2026-08-12T05:00:00.000Z',
  },
  createRequest: {
    providerKind: 'DEEPSEEK',
    displayName: 'Clinic DeepSeek',
    apiKey: 'sk-sample-provider-key',
    defaultModel: 'deepseek-chat',
    isEnabled: true,
    maxTokens: 2048,
    timeoutMs: 30000,
  },
  updateRequest: {
    displayName: 'Clinic DeepSeek (production)',
    defaultModel: 'deepseek-reasoner',
    apiKey: 'sk-rotated-provider-key',
  },
  connectionTestResult: {
    isSuccessful: true,
    message: 'Provider accepted the credentials and answered with model deepseek-chat',
    testedAt: '2026-08-12T04:20:00.000Z',
  },
  deletedConfig: {
    id: '5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e',
  },
} as const;
