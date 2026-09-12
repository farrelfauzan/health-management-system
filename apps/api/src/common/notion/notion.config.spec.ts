import { ConfigService } from '@nestjs/config';

import { resolveNotionConfig } from './notion.config';

const VALID_TOKEN = 'ntn_secret_token_value_that_must_never_be_logged';
const DASHED_DATA_SOURCE_ID = '11111111-2222-4333-8444-555555555555';
const DASHLESS_DATA_SOURCE_ID = '11111111222243338444555555555555';

function buildConfigService(values: Record<string, string>): ConfigService {
  return { get: (key: string): string | undefined => values[key] } as ConfigService;
}

describe('resolveNotionConfig', () => {
  it('resolves credentials and defaults when both variables are set', () => {
    const inputConfigService = buildConfigService({
      NOTION_API_TOKEN: VALID_TOKEN,
      NOTION_BUG_BOARD_DATA_SOURCE_ID: DASHED_DATA_SOURCE_ID,
    });
    const actualConfig = resolveNotionConfig(inputConfigService);
    expect(actualConfig).toEqual({
      isConfigured: true,
      apiToken: VALID_TOKEN,
      bugBoardDataSourceId: DASHED_DATA_SOURCE_ID,
      requestTimeoutMs: 10_000,
      maxRequestsPerSecond: 3,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerOpenDurationMs: 30_000,
    });
  });

  it('reports not configured when no Notion variable is set', () => {
    const actualConfig = resolveNotionConfig(buildConfigService({}));
    expect(actualConfig.isConfigured).toBe(false);
    expect(actualConfig.apiToken).toBeUndefined();
    expect(actualConfig.bugBoardDataSourceId).toBeUndefined();
  });

  it('treats an empty string as unset, the way an unconfigured CI secret arrives', () => {
    const inputConfigService = buildConfigService({
      NOTION_API_TOKEN: '',
      NOTION_BUG_BOARD_DATA_SOURCE_ID: '   ',
    });
    expect(resolveNotionConfig(inputConfigService).isConfigured).toBe(false);
  });

  it('fails naming the data source id when only the token is set', () => {
    const inputConfigService = buildConfigService({ NOTION_API_TOKEN: VALID_TOKEN });
    expect(() => resolveNotionConfig(inputConfigService)).toThrow(
      /NOTION_BUG_BOARD_DATA_SOURCE_ID is required/,
    );
  });

  it('fails naming the token when only the data source id is set', () => {
    const inputConfigService = buildConfigService({
      NOTION_BUG_BOARD_DATA_SOURCE_ID: DASHED_DATA_SOURCE_ID,
    });
    expect(() => resolveNotionConfig(inputConfigService)).toThrow(/NOTION_API_TOKEN is required/);
  });

  it('accepts a dashless data source id and normalises it', () => {
    const inputConfigService = buildConfigService({
      NOTION_API_TOKEN: VALID_TOKEN,
      NOTION_BUG_BOARD_DATA_SOURCE_ID: DASHLESS_DATA_SOURCE_ID.toUpperCase(),
    });
    expect(resolveNotionConfig(inputConfigService).bugBoardDataSourceId).toBe(
      DASHED_DATA_SOURCE_ID,
    );
  });

  it('rejects a data source id that is not a UUID', () => {
    const inputConfigService = buildConfigService({
      NOTION_API_TOKEN: VALID_TOKEN,
      NOTION_BUG_BOARD_DATA_SOURCE_ID: 'https://notion.so/bug-board',
    });
    expect(() => resolveNotionConfig(inputConfigService)).toThrow(/must be a UUID/);
  });

  it('rejects a non-positive numeric setting, naming the variable', () => {
    const inputConfigService = buildConfigService({
      NOTION_API_TOKEN: VALID_TOKEN,
      NOTION_BUG_BOARD_DATA_SOURCE_ID: DASHED_DATA_SOURCE_ID,
      NOTION_MAX_REQUESTS_PER_SECOND: '0',
    });
    expect(() => resolveNotionConfig(inputConfigService)).toThrow(
      /NOTION_MAX_REQUESTS_PER_SECOND must be a positive integer/,
    );
  });

  it('reads the overridable timings', () => {
    const inputConfigService = buildConfigService({
      NOTION_API_TOKEN: VALID_TOKEN,
      NOTION_BUG_BOARD_DATA_SOURCE_ID: DASHED_DATA_SOURCE_ID,
      NOTION_TIMEOUT_MS: '2500',
      NOTION_MAX_REQUESTS_PER_SECOND: '1',
      NOTION_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2',
      NOTION_CIRCUIT_BREAKER_OPEN_DURATION_MS: '1000',
    });
    const actualConfig = resolveNotionConfig(inputConfigService);
    expect(actualConfig.requestTimeoutMs).toBe(2500);
    expect(actualConfig.maxRequestsPerSecond).toBe(1);
    expect(actualConfig.circuitBreakerFailureThreshold).toBe(2);
    expect(actualConfig.circuitBreakerOpenDurationMs).toBe(1000);
  });

  it('never puts the token in a configuration error message', () => {
    const inputConfigService = buildConfigService({
      NOTION_API_TOKEN: VALID_TOKEN,
      NOTION_BUG_BOARD_DATA_SOURCE_ID: 'not-a-uuid',
    });
    let actualMessage = '';
    try {
      resolveNotionConfig(inputConfigService);
    } catch (caughtError) {
      actualMessage = (caughtError as Error).message;
    }
    expect(actualMessage).not.toBe('');
    expect(actualMessage).not.toContain(VALID_TOKEN);
  });
});
