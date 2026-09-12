import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { NotionHttpClient } from '../../../common/notion/notion-http.client';
import { NotionError } from '../../../common/notion/notion.error';
import { NotionConfig, NotionDataSource } from '../../../common/notion/notion.types';
import { BUG_BOARD_REQUIRED_FIELDS } from './bug-board-required-fields';
import { NotionConnectorService } from './notion-connector.service';

const DATA_SOURCE_ID = '11111111-2222-4333-8444-5555555f5f21';

function buildHealthyDataSource(): NotionDataSource {
  return {
    id: DATA_SOURCE_ID,
    properties: Object.fromEntries(
      BUG_BOARD_REQUIRED_FIELDS.map((requirement) => [
        requirement.field,
        requirement.type === 'select'
          ? {
              type: 'select',
              select: { options: (requirement.options ?? []).map((name) => ({ name })) },
            }
          : { type: requirement.type },
      ]),
    ),
  };
}

function buildConfig(overrides: Partial<NotionConfig> = {}): NotionConfig {
  return {
    isConfigured: true,
    apiToken: 'ntn_secret',
    bugBoardDataSourceId: DATA_SOURCE_ID,
    requestTimeoutMs: 10_000,
    maxRequestsPerSecond: 3,
    circuitBreakerFailureThreshold: 5,
    circuitBreakerOpenDurationMs: 30_000,
    ...overrides,
  };
}

describe('NotionConnectorService', () => {
  const retrieveDataSourceMock = jest.fn();
  const recordMock = jest.fn();
  const inputActor = { sub: 'user-1' } as CurrentUser;

  function buildService(config: NotionConfig = buildConfig()): NotionConnectorService {
    const clientMock = {
      retrieveDataSource: retrieveDataSourceMock,
      getApiVersion: () => '2025-09-03',
      getCircuitBreakerState: () => 'CLOSED' as const,
    } as unknown as NotionHttpClient;
    return new NotionConnectorService(config, clientMock, {
      record: recordMock,
    } as unknown as AuditService);
  }

  beforeEach(() => {
    retrieveDataSourceMock.mockReset();
    recordMock.mockReset();
    recordMock.mockResolvedValue(undefined);
  });

  describe('getStatus', () => {
    it('reports the pinned version and only the last four characters of the board id', () => {
      const actualStatus = buildService().getStatus();
      expect(actualStatus).toEqual({
        isConfigured: true,
        apiVersion: '2025-09-03',
        dataSourceIdLast4: '5f21',
        circuitBreakerState: 'CLOSED',
      });
      expect(JSON.stringify(actualStatus)).not.toContain(DATA_SOURCE_ID);
    });

    it('has no board hint on an unconfigured deployment', () => {
      const actualStatus = buildService(
        buildConfig({ isConfigured: false, apiToken: undefined, bugBoardDataSourceId: undefined }),
      ).getStatus();
      expect(actualStatus.isConfigured).toBe(false);
      expect(actualStatus.dataSourceIdLast4).toBeNull();
    });
  });

  describe('testConnection', () => {
    it('succeeds with no problems when the board matches', async () => {
      retrieveDataSourceMock.mockResolvedValue(buildHealthyDataSource());
      const actualResult = await buildService().testConnection(inputActor);
      expect(actualResult.isConfigured).toBe(true);
      expect(actualResult.isSuccessful).toBe(true);
      expect(actualResult.problems).toEqual([]);
    });

    it('fails naming the renamed field', async () => {
      const inputDataSource = buildHealthyDataSource();
      delete (inputDataSource.properties as Record<string, unknown>).Severity;
      retrieveDataSourceMock.mockResolvedValue(inputDataSource);
      const actualResult = await buildService().testConnection(inputActor);
      expect(actualResult.isSuccessful).toBe(false);
      expect(actualResult.problems).toEqual([
        { field: 'Severity', expected: 'select', actual: 'missing' },
      ]);
    });

    it('says the board was never shared rather than failing generically', async () => {
      retrieveDataSourceMock.mockRejectedValue(
        new NotionError('PERMANENT', 'Notion rejected the request (HTTP 404)', {
          notionCode: 'object_not_found',
          statusCode: 404,
        }),
      );
      const actualResult = await buildService().testConnection(inputActor);
      expect(actualResult.isSuccessful).toBe(false);
      expect(actualResult.problems).toEqual([
        {
          field: 'connection',
          expected: 'the Bug Board is readable by this integration',
          actual: 'object_not_found',
        },
      ]);
    });

    it('distinguishes a revoked token from an unshared board', async () => {
      retrieveDataSourceMock.mockRejectedValue(
        new NotionError('PERMANENT', 'Notion rejected the request (HTTP 401)', {
          notionCode: 'unauthorized',
          statusCode: 401,
        }),
      );
      const actualResult = await buildService().testConnection(inputActor);
      expect(actualResult.problems[0]?.actual).toBe('unauthorized');
    });

    it('calls nothing and records nothing when the deployment is unconfigured', async () => {
      const actualResult = await buildService(
        buildConfig({ isConfigured: false, apiToken: undefined, bugBoardDataSourceId: undefined }),
      ).testConnection(inputActor);
      expect(actualResult).toEqual({
        isConfigured: false,
        isSuccessful: false,
        checkedAt: expect.any(String),
        problems: [],
      });
      expect(retrieveDataSourceMock).not.toHaveBeenCalled();
      expect(recordMock).not.toHaveBeenCalled();
    });

    it('records who tested and the outcome, without the board id', async () => {
      retrieveDataSourceMock.mockResolvedValue(buildHealthyDataSource());
      await buildService().testConnection(inputActor);
      expect(recordMock).toHaveBeenCalledWith({
        action: 'NOTION_CONNECTION_TESTED',
        resource: 'NotionConnector',
        actorUserId: 'user-1',
        metadata: { isSuccessful: true, problemCount: 0 },
      });
    });
  });
});
