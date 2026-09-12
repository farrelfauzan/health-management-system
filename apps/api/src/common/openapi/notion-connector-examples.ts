/**
 * Canonical examples for the Notion connector endpoints, mirrored by
 * `ApiEndpoint` into the OpenAPI document.
 *
 * The board id appears only as its last four characters, which is all the
 * status view ever returns. Every value is synthetic — this repository is
 * public, and no real Notion id or token belongs in it.
 */
export const NOTION_CONNECTOR_EXAMPLES = {
  status: {
    isConfigured: true,
    apiVersion: '2025-09-03',
    dataSourceIdLast4: '5f21',
    circuitBreakerState: 'CLOSED',
  },
  connectionTestResult: {
    isConfigured: true,
    isSuccessful: true,
    checkedAt: '2026-09-12T03:15:00.000Z',
    problems: [],
  },
  failedConnectionTestResult: {
    isConfigured: true,
    isSuccessful: false,
    checkedAt: '2026-09-12T03:15:00.000Z',
    problems: [{ field: 'Severity', expected: 'select', actual: 'missing' }],
  },
} as const;
