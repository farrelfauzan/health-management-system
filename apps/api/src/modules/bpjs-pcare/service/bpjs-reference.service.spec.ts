import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { BpjsPcareError } from '../../../common/bpjs-pcare/bpjs-pcare.error';
import { BpjsPcareConnection } from '../../../common/bpjs-pcare/bpjs-pcare.types';
import { BpjsReferenceService } from './bpjs-reference.service';

describe('BpjsReferenceService', () => {
  const mockConnection: BpjsPcareConnection = {
    environment: 'DEVELOPMENT',
    credentials: {
      consId: 'cons',
      secretKey: 'secret',
      userKey: 'user',
      pcareUsername: 'username',
      pcarePassword: 'password',
    },
  };
  const mockActor = { sub: 'actor-user', email: 'admin@example.com' };

  const configRepositoryMock = { getConnection: jest.fn() };
  const referenceRepositoryMock = {
    replaceCatalog: jest.fn(),
    upsertItems: jest.fn(),
    searchCatalog: jest.fn(),
    existsByCatalogAndCode: jest.fn(),
    getCatalogStatuses: jest.fn(),
  };
  const httpClientMock = { sendRequest: jest.fn() };
  const auditServiceMock = { record: jest.fn() };

  function createService(): BpjsReferenceService {
    return new BpjsReferenceService(
      configRepositoryMock as never,
      referenceRepositoryMock as never,
      httpClientMock as never,
      auditServiceMock as never,
    );
  }

  function stubListResponse(pathMatch: RegExp, payload: unknown): void {
    httpClientMock.sendRequest.mockImplementation(
      (_connection: BpjsPcareConnection, request: { path: string }) => {
        if (pathMatch.test(request.path)) {
          return Promise.resolve({ metaData: { code: '200', message: 'OK' }, response: payload });
        }
        return Promise.resolve({ metaData: { code: '200', message: 'OK' }, response: null });
      },
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    configRepositoryMock.getConnection.mockResolvedValue(mockConnection);
    referenceRepositoryMock.replaceCatalog.mockImplementation(
      ({ items }: { items: unknown[] }) => Promise.resolve(items.length),
    );
    referenceRepositoryMock.upsertItems.mockResolvedValue(undefined);
  });

  describe('syncCatalogs', () => {
    it('replaces the six enumerable catalogs and audits per-catalog counts', async () => {
      stubListResponse(/.*/, { list: [] });
      stubListResponse(/^poli\/fktp\//, { list: [{ kdPoli: '001', nmPoli: 'POLI UMUM' }] });
      httpClientMock.sendRequest.mockImplementation(
        (_connection: BpjsPcareConnection, request: { path: string }) => {
          const payloadByPrefix: Array<[RegExp, unknown]> = [
            [/^poli\/fktp\//, { list: [{ kdPoli: '001', nmPoli: 'POLI UMUM' }] }],
            [/^dokter\//, { list: [{ kdDokter: '1234', nmDokter: 'dr. Sinta' }] }],
            [/^kesadaran$/, { list: [{ kdSadar: '01', nmSadar: 'Compos Mentis' }] }],
            [/^tindakan\/kdTkp\//, { list: [{ kdTindakan: '0101', nmTindakan: 'Jahit Luka' }] }],
            [/^spesialis$/, { list: [{ kdSpesialis: 'ANA', nmSpesialis: 'Anak' }] }],
            [/^spesialis\/sarana$/, { list: [{ kdSarana: '1', nmSarana: 'Laboratorium' }] }],
          ];
          const matched = payloadByPrefix.find(([prefix]) => prefix.test(request.path));
          return Promise.resolve({
            metaData: { code: '200', message: 'OK' },
            response: matched === undefined ? null : matched[1],
          });
        },
      );
      const service = createService();

      const actualResult = await service.syncCatalogs(mockActor as never);

      expect(actualResult.catalogs).toEqual([
        { catalog: 'POLI', itemCount: 1 },
        { catalog: 'DOKTER', itemCount: 1 },
        { catalog: 'KESADARAN', itemCount: 1 },
        { catalog: 'TINDAKAN', itemCount: 3 },
        { catalog: 'SPESIALIS', itemCount: 1 },
        { catalog: 'SARANA', itemCount: 1 },
      ]);
      const tindakanReplace = referenceRepositoryMock.replaceCatalog.mock.calls.find(
        ([data]) => (data as { catalog: string }).catalog === 'TINDAKAN',
      );
      expect(tindakanReplace).toBeDefined();
      expect((tindakanReplace as unknown[])[0]).toMatchObject({
        items: [
          { code: '0101', display: 'Jahit Luka', groupCode: '10' },
          { code: '0101', display: 'Jahit Luka', groupCode: '20' },
          { code: '0101', display: 'Jahit Luka', groupCode: '50' },
        ],
      });
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BPJS_REFERENCE_SYNCED' }),
      );
    });

    it('pages through a catalog until the reported total is collected', async () => {
      const fullPage = Array.from({ length: 100 }, (_unused, index) => ({
        kdDokter: `D${index}`,
        nmDokter: `Dokter ${index}`,
      }));
      const lastPage = Array.from({ length: 50 }, (_unused, index) => ({
        kdDokter: `D${100 + index}`,
        nmDokter: `Dokter ${100 + index}`,
      }));
      httpClientMock.sendRequest.mockImplementation(
        (_connection: BpjsPcareConnection, request: { path: string }) => {
          if (request.path === 'dokter/0/100') {
            return Promise.resolve({
              metaData: { code: '200', message: 'OK' },
              response: { count: 150, list: fullPage },
            });
          }
          if (request.path === 'dokter/100/100') {
            return Promise.resolve({
              metaData: { code: '200', message: 'OK' },
              response: { count: 150, list: lastPage },
            });
          }
          return Promise.resolve({ metaData: { code: '200', message: 'OK' }, response: null });
        },
      );
      const service = createService();

      const actualResult = await service.syncCatalogs(mockActor as never);

      const dokterResult = actualResult.catalogs.find((entry) => entry.catalog === 'DOKTER');
      expect(dokterResult).toEqual({ catalog: 'DOKTER', itemCount: 150 });
    });

    it('maps an upstream failure to 502 with the catalog named', async () => {
      httpClientMock.sendRequest.mockRejectedValue(
        new BpjsPcareError('BPJS_PCARE_UNAVAILABLE', 'PCare responded 502'),
      );
      const service = createService();

      await expect(service.syncCatalogs(mockActor as never)).rejects.toThrow(BadGatewayException);
      await expect(service.syncCatalogs(mockActor as never)).rejects.toThrow(/POLI/);
    });

    it('maps a missing encryption key to 503', async () => {
      configRepositoryMock.getConnection.mockRejectedValue(
        new BpjsPcareError('BPJS_PCARE_NOT_CONFIGURED', 'encryption key missing'),
      );
      const service = createService();

      await expect(service.syncCatalogs(mockActor as never)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('searchRemote', () => {
    it('rejects catalogs that the bulk sync covers', async () => {
      const service = createService();

      await expect(
        service.searchRemote('POLI', { query: 'umum' }, mockActor as never),
      ).rejects.toThrow(BadRequestException);
      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
    });

    it('runs the keyword lookup, caches the results, and returns them', async () => {
      stubListResponse(/^obat\/dpho\/paracetamol\/0\/50$/, {
        list: [{ kdObat: 'K0001', nmObat: 'PARACETAMOL TAB 500 MG' }],
      });
      const service = createService();

      const actualItems = await service.searchRemote(
        'DPHO',
        { query: 'paracetamol' },
        mockActor as never,
      );

      expect(actualItems).toHaveLength(1);
      expect(actualItems[0]).toMatchObject({
        catalog: 'DPHO',
        code: 'K0001',
        display: 'PARACETAMOL TAB 500 MG',
      });
      expect(referenceRepositoryMock.upsertItems).toHaveBeenCalledWith(
        expect.objectContaining({
          catalog: 'DPHO',
          items: [{ code: 'K0001', display: 'PARACETAMOL TAB 500 MG', groupCode: null }],
        }),
      );
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BPJS_REFERENCE_SYNCED',
          metadata: { mode: 'KEYWORD', catalog: 'DPHO', itemCount: 1 },
        }),
      );
    });
  });

  describe('getStatus', () => {
    it('marks the keyword catalogs as not bulk-syncable', async () => {
      referenceRepositoryMock.getCatalogStatuses.mockResolvedValue([
        { catalog: 'POLI', itemCount: 12, lastSyncedAt: new Date('2026-08-03T02:00:00.000Z') },
        { catalog: 'DPHO', itemCount: 41, lastSyncedAt: null },
      ]);
      const service = createService();

      const actualStatuses = await service.getStatus();

      expect(actualStatuses).toEqual([
        {
          catalog: 'POLI',
          itemCount: 12,
          lastSyncedAt: '2026-08-03T02:00:00.000Z',
          isSyncable: true,
        },
        { catalog: 'DPHO', itemCount: 41, lastSyncedAt: null, isSyncable: false },
      ]);
    });
  });
});
