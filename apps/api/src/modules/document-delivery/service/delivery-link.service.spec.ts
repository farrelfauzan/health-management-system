import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DELIVERY_LINK_TOKEN_PATTERN, DeliveryLinkLookupRecord } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { InvoiceDocumentService } from '../../billing/service/invoice-document.service';
import { DocumentDeliveryRepository } from '../repository/document-delivery.repository';
import { DELIVERY_LINK_UNAVAILABLE_CODE, DeliveryLinkService } from './delivery-link.service';
import { generateDeliveryLinkToken, hashDeliveryLinkToken } from './delivery-link-token';
import { PublicLinkRateLimiter } from './public-link-rate-limiter';

const NOW = new Date('2026-09-29T08:00:00.000Z');
const HOURS_7_DAYS = 7 * 24;
const MS_PER_HOUR = 3_600_000;
const TOKEN = generateDeliveryLinkToken();
const REQUEST_IP = '203.0.113.7';

function buildLookup(overrides: Partial<DeliveryLinkLookupRecord> = {}): DeliveryLinkLookupRecord {
  return {
    link: {
      id: 'link-1',
      deliveryId: 'delivery-1',
      expiresAt: new Date(NOW.getTime() + MS_PER_HOUR),
      revokedAt: null,
      openCount: 0,
      lastOpenedAt: null,
    },
    delivery: { id: 'delivery-1', patientId: 'patient-1', status: 'SENT' },
    invoice: { id: 'invoice-1', invoiceNumber: 'INV/2026/09/000123', status: 'PAID' },
    storageKey: 'invoices/doc-1.pdf',
    ...overrides,
  };
}

describe('DeliveryLinkService', () => {
  let service: DeliveryLinkService;
  let mockRepository: jest.Mocked<
    Pick<DocumentDeliveryRepository, 'createLink' | 'findLinkByTokenHash' | 'recordLinkOpen'>
  >;
  let mockStorage: jest.Mocked<Pick<ObjectStorageService, 'getSignedUrl'>>;
  let mockRateLimiter: jest.Mocked<Pick<PublicLinkRateLimiter, 'assertWithinLimit'>>;
  let mockAuditService: jest.Mocked<Pick<AuditService, 'record'>>;

  beforeEach(() => {
    const configValues: Record<string, string> = {
      DELIVERY_LINK_TTL_DAYS: '7',
      WEB_APP_BASE_URL: 'https://klinik.example.id/',
    };
    const configService = { get: jest.fn((key: string) => configValues[key]) };
    mockRepository = {
      createLink: jest.fn().mockResolvedValue(buildLookup().link),
      findLinkByTokenHash: jest.fn().mockResolvedValue(buildLookup()),
      recordLinkOpen: jest.fn().mockResolvedValue(undefined),
    };
    mockStorage = {
      getSignedUrl: jest.fn().mockResolvedValue({
        url: 'https://storage.example/signed',
        expiresAt: '2026-09-29T08:05:00.000Z',
      }),
    };
    mockRateLimiter = { assertWithinLimit: jest.fn() };
    mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };
    const invoiceDocumentService = {
      buildFileName: jest.fn(
        (invoiceNumber: string) => `${invoiceNumber.replaceAll('/', '-')}.pdf`,
      ),
    };
    service = new DeliveryLinkService(
      configService as unknown as ConfigService,
      mockRepository as unknown as DocumentDeliveryRepository,
      invoiceDocumentService as unknown as InvoiceDocumentService,
      mockStorage as unknown as ObjectStorageService,
      mockRateLimiter as unknown as PublicLinkRateLimiter,
      mockAuditService as unknown as AuditService,
    );
  });

  describe('mintLink', () => {
    it('stores only the hash, expires after the configured days, and returns the web URL', async () => {
      const actual = await service.mintLink('delivery-1', NOW);

      const token = actual.url.split('/inv/')[1] ?? '';
      expect(token).toMatch(DELIVERY_LINK_TOKEN_PATTERN);
      expect(actual.url).toBe(`https://klinik.example.id/inv/${token}`);
      expect(actual.expiresAt).toEqual(new Date(NOW.getTime() + HOURS_7_DAYS * MS_PER_HOUR));
      expect(mockRepository.createLink).toHaveBeenCalledWith({
        deliveryId: 'delivery-1',
        tokenHash: hashDeliveryLinkToken(token),
        expiresAt: actual.expiresAt,
      });
      expect(JSON.stringify(mockRepository.createLink.mock.calls)).not.toContain(token);
    });
  });

  describe('resolve', () => {
    it('serves a presigned attachment download, counts the open, and audits it without an actor', async () => {
      const actual = await service.resolve({ token: TOKEN, requestIp: REQUEST_IP, now: NOW });

      expect(actual).toEqual({
        url: 'https://storage.example/signed',
        fileName: 'INV-2026-09-000123.pdf',
        expiresAt: '2026-09-29T08:05:00.000Z',
      });
      expect(mockStorage.getSignedUrl).toHaveBeenCalledWith({
        key: 'invoices/doc-1.pdf',
        responseContentDisposition: 'attachment; filename="INV-2026-09-000123.pdf"',
        responseContentType: 'application/pdf',
      });
      expect(mockRepository.recordLinkOpen).toHaveBeenCalledWith({
        linkId: 'link-1',
        deliveryId: 'delivery-1',
        openedAt: NOW,
      });
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELIVERY_OPENED',
          actorUserId: null,
          patientId: 'patient-1',
          ipAddress: REQUEST_IP,
          resourceId: 'delivery-1',
        }),
      );
    });

    it('limits per address first and per token second', async () => {
      await service.resolve({ token: TOKEN, requestIp: REQUEST_IP, now: NOW });

      expect(mockRateLimiter.assertWithinLimit.mock.calls).toEqual([
        [{ key: `ip:${REQUEST_IP}`, limit: 60 }, NOW.getTime()],
        [{ key: `token:${hashDeliveryLinkToken(TOKEN)}`, limit: 10 }, NOW.getTime()],
      ]);
    });

    it('refuses a malformed token before asking the database', async () => {
      await expect(
        service.resolve({ token: 'not-a-token', requestIp: REQUEST_IP, now: NOW }),
      ).rejects.toMatchObject({ response: { code: DELIVERY_LINK_UNAVAILABLE_CODE } });
      expect(mockRepository.findLinkByTokenHash).not.toHaveBeenCalled();
    });

    it.each([
      ['unknown', null],
      [
        'expired',
        buildLookup({ link: { ...buildLookup().link, expiresAt: new Date(NOW.getTime() - 1) } }),
      ],
      ['revoked', buildLookup({ link: { ...buildLookup().link, revokedAt: NOW } })],
      ['not yet sent', buildLookup({ delivery: { ...buildLookup().delivery, status: 'QUEUED' } })],
      [
        'revoked delivery',
        buildLookup({ delivery: { ...buildLookup().delivery, status: 'REVOKED' } }),
      ],
      ['voided invoice', buildLookup({ invoice: { ...buildLookup().invoice!, status: 'VOID' } })],
      ['no stored object', buildLookup({ storageKey: null })],
    ])('answers a %s link with the same not-found and records nothing', async (_label, lookup) => {
      mockRepository.findLinkByTokenHash.mockResolvedValue(lookup);

      const actual = service.resolve({ token: TOKEN, requestIp: REQUEST_IP, now: NOW });

      await expect(actual).rejects.toBeInstanceOf(NotFoundException);
      await expect(actual).rejects.toMatchObject({
        response: {
          code: DELIVERY_LINK_UNAVAILABLE_CODE,
          message: 'This link is no longer valid. Please contact the clinic.',
        },
      });
      expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
      expect(mockRepository.recordLinkOpen).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
  });
});
