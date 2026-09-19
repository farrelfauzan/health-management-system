import { TaxSettingsRecord } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { TaxSettingsRepository } from '../repository/tax-settings.repository';

/**
 * What a clinic that has never opened the tax page is: on the general regime,
 * not PKP, with no legal form guessed (D-038). Prices are always tax-inclusive,
 * so there is nothing to choose there (P27-T04).
 */
const DEFAULT_TAX_SETTINGS: TaxSettingsRecord = {
  taxpayerType: null,
  incomeTaxRegime: 'GENERAL',
  pp55StartYear: null,
  isPkp: false,
  pkpSince: null,
  nitku: null,
  updatedById: null,
  updatedAt: null,
};

/**
 * The clinic's tax profile as every tax computation reads it (P27-T02/T04).
 * Lives in the tax core, below billing, so an invoice can ask whether the
 * clinic is PKP without billing depending on the tax settings screen.
 */
@Injectable()
export class TaxProfileService {
  constructor(private readonly taxSettingsRepository: TaxSettingsRepository) {}

  async getTaxSettings(): Promise<TaxSettingsRecord> {
    const record = await this.taxSettingsRepository.findTaxSettings();
    return record ?? DEFAULT_TAX_SETTINGS;
  }
}
