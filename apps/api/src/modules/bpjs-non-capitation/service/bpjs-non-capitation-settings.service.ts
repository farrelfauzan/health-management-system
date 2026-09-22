import {
  CreateNonCapitationTariffInput,
  NON_CAPITATION_DEFAULT_FILING_DAY,
  NON_CAPITATION_TARIFF_OVERLAP_ERROR_CODE,
  NonCapitationSettingsView,
  NonCapitationTariffSource,
  NonCapitationTariffView,
  UpdateNonCapitationSettingsInput,
} from '@hms/shared-types';
import { ConflictException, Injectable } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import {
  BpjsNonCapitationSettings,
  BpjsNonCapitationTariff,
} from '../../../generated/prisma/client';
import { BpjsNonCapitationConfigRepository } from '../repository/bpjs-non-capitation-config.repository';
import { NonCapitationTariffOverlapError } from '../repository/non-capitation-tariff-overlap.error';

const SETTINGS_AUDIT_RESOURCE = 'bpjs-non-capitation-settings';
const TARIFF_AUDIT_RESOURCE = 'bpjs-non-capitation-tariff';

/** Nothing is known until Q12 is answered, except Permenkes 28/2014's 10th. */
const DEFAULT_SETTINGS: NonCapitationSettingsView = {
  networkParentProviderCode: null,
  networkParentProviderName: null,
  isNetworkParentGovernmentOwned: null,
  hasOwnEclaimLogin: null,
  filingDayOfMonth: NON_CAPITATION_DEFAULT_FILING_DAY,
  isConfigured: false,
  updatedAt: null,
};

function toDateText(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function toSettingsView(row: BpjsNonCapitationSettings): NonCapitationSettingsView {
  return {
    networkParentProviderCode: row.networkParentProviderCode,
    networkParentProviderName: row.networkParentProviderName,
    isNetworkParentGovernmentOwned: row.isNetworkParentGovernmentOwned,
    hasOwnEclaimLogin: row.hasOwnEclaimLogin,
    filingDayOfMonth: row.filingDayOfMonth,
    isConfigured: row.networkParentProviderCode !== null && row.networkParentProviderName !== null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTariffView(row: BpjsNonCapitationTariff): NonCapitationTariffView {
  return {
    id: row.id,
    serviceType: row.serviceType,
    amount: row.amount.toNumber(),
    validFrom: row.validFrom.toISOString().slice(0, 10),
    validUntil: toDateText(row.validUntil),
    regulationReference: row.regulationReference,
  };
}

/**
 * The induk FKTP settings and the tariff table of the non-capitation recap
 * (P25-T16, D-043). Q12 is unanswered, so everything it would decide is a
 * setting an admin changes on the BPJS panel rather than a constant.
 */
@Injectable()
export class BpjsNonCapitationSettingsService {
  constructor(
    private readonly configRepository: BpjsNonCapitationConfigRepository,
    private readonly auditService: AuditService,
  ) {}

  async getSettings(): Promise<NonCapitationSettingsView> {
    const row = await this.configRepository.findSettings();
    return row === null ? DEFAULT_SETTINGS : toSettingsView(row);
  }

  async updateSettings(
    input: UpdateNonCapitationSettingsInput,
    actor: CurrentUser,
  ): Promise<NonCapitationSettingsView> {
    const row = await this.configRepository.saveSettings(input, actor.sub);
    await this.auditService.record({
      action: 'NON_CAPITATION_SETTINGS_CHANGED',
      resource: SETTINGS_AUDIT_RESOURCE,
      resourceId: row.id,
      actorUserId: actor.sub,
      metadata: { ...input },
    });
    return toSettingsView(row);
  }

  async listTariffs(): Promise<NonCapitationTariffView[]> {
    return (await this.configRepository.listTariffs()).map(toTariffView);
  }

  /** The tariff rows as the recap builder reads them. */
  async listTariffSources(): Promise<NonCapitationTariffSource[]> {
    return this.listTariffs();
  }

  async createTariff(
    input: CreateNonCapitationTariffInput,
    actor: CurrentUser,
  ): Promise<NonCapitationTariffView> {
    const row = await this.configRepository
      .createTariff(input, actor.sub)
      .catch((error: unknown) => {
        if (error instanceof NonCapitationTariffOverlapError) {
          throw new ConflictException({
            code: NON_CAPITATION_TARIFF_OVERLAP_ERROR_CODE,
            message: 'A tariff of this service type already starts on or after this date',
          });
        }
        throw error;
      });
    await this.auditService.record({
      action: 'NON_CAPITATION_TARIFF_CHANGED',
      resource: TARIFF_AUDIT_RESOURCE,
      resourceId: row.id,
      actorUserId: actor.sub,
      metadata: { ...input },
    });
    return toTariffView(row);
  }
}
