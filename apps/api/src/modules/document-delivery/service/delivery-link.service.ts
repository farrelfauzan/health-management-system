import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DELIVERY_LINK_TOKEN_PATTERN,
  DeliveryLinkLookupRecord,
  DeliveryLinkResolutionView,
  DeliveryStatusValue,
  DocumentDeliveryConfig,
  MintedDeliveryLink,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { AuditAction } from '../../../generated/prisma/client';
import { InvoiceDocumentService } from '../../billing/service/invoice-document.service';
import { resolveDocumentDeliveryConfig } from '../document-delivery.config';
import { DocumentDeliveryRepository } from '../repository/document-delivery.repository';
import { generateDeliveryLinkToken, hashDeliveryLinkToken } from './delivery-link-token';
import { PublicLinkRateLimiter } from './public-link-rate-limiter';

const MILLISECONDS_PER_HOUR = 3_600_000;
const LINK_PATH_PREFIX = '/inv/';
const PDF_CONTENT_TYPE = 'application/pdf';
const OPENS_PER_ADDRESS_PER_MINUTE = 60;
const OPENS_PER_TOKEN_PER_MINUTE = 10;
const DELIVERY_AUDIT_RESOURCE = 'DocumentDelivery';

/** A link opens only once its message has gone out. */
const OPENABLE_STATUSES: ReadonlySet<DeliveryStatusValue> = new Set([
  'SENT',
  'DELIVERED',
  'OPENED',
]);

export const DELIVERY_LINK_UNAVAILABLE_CODE = 'DELIVERY_LINK_UNAVAILABLE';

/**
 * The revocable link behind a LINK delivery (`P16-T25`, FR-E4-11/20).
 *
 * {@link mintLink} is the worker's call at send time: it creates the token,
 * stores only its hash, and returns the URL for the message. {@link resolve}
 * is the public route's one call: rate-limited per address and per token,
 * and answering every failure — unknown, expired, revoked, a voided invoice,
 * a message that never went out — with the same 404, so the route never
 * confirms that a bill exists (§7.4.9). A success is an open: it is counted,
 * audited without an actor, and answered with a presigned GET that expires
 * in minutes. The token is not the storage key and never appears next to one.
 */
@Injectable()
export class DeliveryLinkService {
  private readonly deliveryConfig: DocumentDeliveryConfig;

  constructor(
    configService: ConfigService,
    private readonly deliveryRepository: DocumentDeliveryRepository,
    private readonly invoiceDocumentService: InvoiceDocumentService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly rateLimiter: PublicLinkRateLimiter,
    private readonly auditService: AuditService,
  ) {
    this.deliveryConfig = resolveDocumentDeliveryConfig(configService);
  }

  async mintLink(deliveryId: string, now: Date = new Date()): Promise<MintedDeliveryLink> {
    const token = generateDeliveryLinkToken();
    const expiresAt = new Date(
      now.getTime() + this.deliveryConfig.linkTtlHours * MILLISECONDS_PER_HOUR,
    );
    await this.deliveryRepository.createLink({
      deliveryId,
      tokenHash: hashDeliveryLinkToken(token),
      expiresAt,
    });
    return { url: `${this.deliveryConfig.webAppBaseUrl}${LINK_PATH_PREFIX}${token}`, expiresAt };
  }

  async resolve(params: {
    token: string;
    requestIp: string;
    now?: Date;
  }): Promise<DeliveryLinkResolutionView> {
    const now = params.now ?? new Date();
    this.rateLimiter.assertWithinLimit(
      { key: `ip:${params.requestIp}`, limit: OPENS_PER_ADDRESS_PER_MINUTE },
      now.getTime(),
    );
    if (!DELIVERY_LINK_TOKEN_PATTERN.test(params.token)) {
      throw buildUnavailable();
    }
    const tokenHash = hashDeliveryLinkToken(params.token);
    this.rateLimiter.assertWithinLimit(
      { key: `token:${tokenHash}`, limit: OPENS_PER_TOKEN_PER_MINUTE },
      now.getTime(),
    );
    const lookup = await this.deliveryRepository.findLinkByTokenHash(tokenHash);
    if (lookup === null || !isOpenable(lookup, now)) {
      throw buildUnavailable();
    }
    const fileName = this.invoiceDocumentService.buildFileName(lookup.invoice.invoiceNumber);
    const signed = await this.objectStorageService.getSignedUrl({
      key: lookup.storageKey,
      responseContentDisposition: `attachment; filename="${fileName}"`,
      responseContentType: PDF_CONTENT_TYPE,
    });
    await this.deliveryRepository.recordLinkOpen({
      linkId: lookup.link.id,
      deliveryId: lookup.delivery.id,
      openedAt: now,
    });
    await this.auditService.record({
      action: AuditAction.DELIVERY_OPENED,
      resource: DELIVERY_AUDIT_RESOURCE,
      resourceId: lookup.delivery.id,
      actorUserId: null,
      patientId: lookup.delivery.patientId,
      ipAddress: params.requestIp,
      metadata: { invoiceId: lookup.invoice.id, openCount: lookup.link.openCount + 1 },
    });
    return { url: signed.url, fileName, expiresAt: signed.expiresAt };
  }
}

type OpenableLookup = DeliveryLinkLookupRecord & {
  invoice: NonNullable<DeliveryLinkLookupRecord['invoice']>;
  storageKey: string;
};

function isOpenable(lookup: DeliveryLinkLookupRecord, now: Date): lookup is OpenableLookup {
  return (
    lookup.link.revokedAt === null &&
    lookup.link.expiresAt.getTime() > now.getTime() &&
    OPENABLE_STATUSES.has(lookup.delivery.status) &&
    lookup.invoice !== null &&
    lookup.invoice.status !== 'VOID' &&
    lookup.storageKey !== null
  );
}

function buildUnavailable(): NotFoundException {
  return new NotFoundException({
    message: 'This link is no longer valid. Please contact the clinic.',
    code: DELIVERY_LINK_UNAVAILABLE_CODE,
  });
}
