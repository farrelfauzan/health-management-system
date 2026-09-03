import { VAULT_DOCUMENT_EXPIRY_THRESHOLD_DAYS, getCalendarDateInTimeZone } from '@hms/shared-types';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { Document } from '../../../generated/prisma/client';
import { NotificationService } from '../../notification/service/notification.service';
import { VaultDocumentRepository } from '../repository/vault-document.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const DEFAULT_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const VAULT_HREF = '/vault';

/**
 * Owner-only expiry reminders for the document vault (`P16-T18`, FR-E3-08).
 *
 * **This job has no administrator path, and that absence is the feature.**
 * There is no branch here that copies a clinic administrator, no permission
 * key it broadcasts to, and nothing that aggregates these into a dashboard.
 * A doctor is told that their own STR is lapsing because it is a service to
 * them; it is not a report to their employer. `NotificationService.createForUser`
 * is the only producer call in this file — the `createForUsers*` broadcast
 * methods are deliberately not imported, so adding a clinic-wide recipient
 * would be a visible change rather than one more argument.
 *
 * The clinic's legitimate need to know that a practitioner is out of licence
 * is met by `DoctorLicense` (`P16-T19`), which touches no document at all.
 * Two mechanisms rather than one is what lets the vault stay entirely private
 * (§7.3.2, §7.3.11).
 *
 * Follows `DocumentIngestionWorker`'s shape — an interval on bootstrap,
 * `unref`'d — rather than a scheduler dependency. It sweeps every six hours
 * rather than once a day because the notice table makes a re-run a no-op, so
 * a longer interval buys only a longer wait before the owner hears.
 */
@Injectable()
export class VaultDocumentExpiryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(VaultDocumentExpiryWorker.name);
  private readonly clinicTimeZone: string;
  private readonly isEnabled: boolean;
  private readonly sweepIntervalMs: number;
  private sweepTimer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(
    private readonly vaultDocumentRepository: VaultDocumentRepository,
    private readonly notificationService: NotificationService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
    this.isEnabled = configService.get<string>('VAULT_EXPIRY_REMINDERS_ENABLED') !== 'false';
    this.sweepIntervalMs = this.readSweepIntervalMs(configService);
  }

  onApplicationBootstrap(): void {
    if (!this.isEnabled) {
      this.logger.log('Vault expiry reminders disabled (VAULT_EXPIRY_REMINDERS_ENABLED=false)');
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.sweepOnce();
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();
    this.logger.log(`Vault expiry reminders sweeping every ${this.sweepIntervalMs}ms`);
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Runs one sweep and returns how many reminders it sent.
   *
   * Thresholds are walked widest first and a document is announced at every
   * threshold it has crossed and not yet been claimed for. That matters for a
   * document whose expiry passed while the job was down: the 0-day threshold
   * still fires once, because the claim is keyed to the threshold rather than
   * to a calendar date the job had to be running to observe.
   */
  async sweepOnce(): Promise<number> {
    if (this.isSweeping) {
      return 0;
    }
    this.isSweeping = true;
    try {
      const today = this.resolveClinicToday();
      let sentCount = 0;
      for (const thresholdDays of VAULT_DOCUMENT_EXPIRY_THRESHOLD_DAYS) {
        const documents = await this.vaultDocumentRepository.listExpiringVaultDocuments(
          new Date(today.getTime() + thresholdDays * MILLISECONDS_PER_DAY),
        );
        for (const document of documents) {
          const claimed = await this.vaultDocumentRepository.claimExpiryNotice(
            document.id,
            thresholdDays,
          );
          if (!claimed) {
            continue;
          }
          await this.notifyOwner(document, today);
          sentCount += 1;
        }
      }
      return sentCount;
    } catch {
      this.logger.error(buildSafeErrorLog('vault_expiry_sweep_failed'));
      return 0;
    } finally {
      this.isSweeping = false;
    }
  }

  /**
   * One bell, to `document.ownerId` and to nobody else.
   *
   * A vault document always has an owner — the migration's CHECK ties
   * `DOCTOR_VAULT` to a non-null `ownerId` — but the column is nullable for
   * the clinic corpus, so the guard below is a type narrowing rather than a
   * case anyone expects to hit. The `href` lands on the owner's own vault
   * page; a notification never exposes anything to another user.
   */
  private async notifyOwner(document: Document, today: Date): Promise<void> {
    if (document.ownerId === null || document.expiresAt === null) {
      return;
    }
    const hasExpired = document.expiresAt.getTime() < today.getTime();
    await this.notificationService.createForUser({
      userId: document.ownerId,
      type: hasExpired ? 'VAULT_DOCUMENT_EXPIRED' : 'VAULT_DOCUMENT_EXPIRING',
      titleKey: hasExpired ? 'vaultDocumentExpired.title' : 'vaultDocumentExpiring.title',
      bodyKey: hasExpired ? 'vaultDocumentExpired.body' : 'vaultDocumentExpiring.body',
      params: {
        documentTitle: document.title,
        expiresAt: document.expiresAt.toISOString().slice(0, 10),
      },
      href: VAULT_HREF,
    });
  }

  /**
   * Midnight UTC of the clinic's current calendar day. Expiry is a date, not
   * an instant: a document expiring "today" has not expired yet, whatever the
   * server's clock reads.
   */
  private resolveClinicToday(): Date {
    return new Date(`${getCalendarDateInTimeZone(new Date(), this.clinicTimeZone)}T00:00:00.000Z`);
  }

  private readSweepIntervalMs(configService: ConfigService): number {
    const rawValue = configService.get<string>('VAULT_EXPIRY_SWEEP_INTERVAL_MS');
    if (rawValue === undefined || rawValue.trim() === '') {
      return DEFAULT_SWEEP_INTERVAL_MS;
    }
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        'Vault expiry configuration error: VAULT_EXPIRY_SWEEP_INTERVAL_MS must be a positive integer',
      );
    }
    return parsed;
  }
}
