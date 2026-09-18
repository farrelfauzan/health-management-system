import {
  NPWP_DIGIT_COUNT,
  SaveTaxSettingsPayload,
  TAX_NITKU_NPWP_MISMATCH_ERROR_CODE,
  TAX_PKP_SINCE_REQUIRED_ERROR_CODE,
  TAX_PP55_NOT_ELIGIBLE_ERROR_CODE,
  TaxSettingsRecord,
  TaxSettingsView,
  UpdateTaxSettingsInput,
  ValidateTaxSettingsParams,
  getCalendarDateInTimeZone,
  normalizeNpwp,
  resolveNpwpStatus,
  resolvePp55Eligibility,
} from '@hms/shared-types';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { TaxSettingsRepository } from '../repository/tax-settings.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const TAX_SETTINGS_AUDIT_RESOURCE = 'tax-settings';
const CALENDAR_YEAR_LENGTH = 4;

/**
 * What a clinic that has never opened the tax page is: on the general regime,
 * not PKP, quoting tax-inclusive prices, with no legal form guessed (D-038).
 */
const DEFAULT_TAX_SETTINGS: TaxSettingsRecord = {
  taxpayerType: null,
  incomeTaxRegime: 'GENERAL',
  pp55StartYear: null,
  isPkp: false,
  pkpSince: null,
  nitku: null,
  pricesIncludeTax: true,
  updatedById: null,
  updatedAt: null,
};

/** The columns an audit row compares, in the order an administrator reads them. */
const AUDITED_FIELDS = [
  'taxpayerType',
  'incomeTaxRegime',
  'pp55StartYear',
  'isPkp',
  'pkpSince',
  'nitku',
  'pricesIncludeTax',
] as const satisfies ReadonlyArray<keyof TaxSettingsRecord>;

/**
 * Who the clinic is as a taxpayer (P27-T02, `docs/post-mvp/decisions.md` D-038).
 *
 * Every later tax computation — tax on invoices, the monthly drafts — reads this
 * row, so it is stored with an actor and a timestamp and every change is its
 * own audit event. Rules that need the stored row as well as the request are
 * judged here, on the merged result: PP 55 eligibility under PP 20/2026, the
 * PKP registration date, and a NITKU that must extend the clinic's NPWP.
 */
@Injectable()
export class TaxSettingsService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly taxSettingsRepository: TaxSettingsRepository,
    private readonly clinicProfileService: ClinicProfileService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async getTaxSettings(): Promise<TaxSettingsRecord> {
    const record = await this.taxSettingsRepository.findTaxSettings();
    return record ?? DEFAULT_TAX_SETTINGS;
  }

  async getTaxSettingsView(): Promise<TaxSettingsView> {
    const [record, taxId] = await Promise.all([
      this.getTaxSettings(),
      this.clinicProfileService.getTaxId(),
    ]);
    return this.toView(record, taxId);
  }

  async updateTaxSettings(
    input: UpdateTaxSettingsInput,
    actor: CurrentUser,
  ): Promise<TaxSettingsView> {
    const previous = await this.getTaxSettings();
    const merged = this.mergeTaxSettings(previous, input, actor.sub);
    const taxId = await this.clinicProfileService.getTaxId();
    this.assertTaxSettingsValid({ merged, input, taxId });
    const saved = await this.taxSettingsRepository.saveTaxSettings(merged);
    await this.recordChanges(previous, saved, actor);
    return this.toView(saved, taxId);
  }

  /**
   * Applies the PATCH to the stored row. Two fields are derived rather than
   * trusted: a start year means nothing off PP 55, and a registration date
   * means nothing for a clinic that is not PKP — both are cleared so the row
   * never claims either.
   */
  private mergeTaxSettings(
    previous: TaxSettingsRecord,
    input: UpdateTaxSettingsInput,
    updatedById: string,
  ): SaveTaxSettingsPayload {
    const incomeTaxRegime = input.incomeTaxRegime ?? previous.incomeTaxRegime;
    const isPkp = input.isPkp ?? previous.isPkp;
    const pp55StartYear =
      input.pp55StartYear === undefined ? previous.pp55StartYear : input.pp55StartYear;
    const pkpSince = input.pkpSince === undefined ? previous.pkpSince : input.pkpSince;
    return {
      taxpayerType: input.taxpayerType === undefined ? previous.taxpayerType : input.taxpayerType,
      incomeTaxRegime,
      pp55StartYear: incomeTaxRegime === 'PP55_FINAL' ? pp55StartYear : null,
      isPkp,
      pkpSince: isPkp ? pkpSince : null,
      nitku: input.nitku === undefined ? previous.nitku : input.nitku,
      pricesIncludeTax: input.pricesIncludeTax ?? previous.pricesIncludeTax,
      updatedById,
    };
  }

  private assertTaxSettingsValid(params: ValidateTaxSettingsParams): void {
    this.assertPp55Eligible(params.merged, params.input);
    if (params.merged.isPkp && params.merged.pkpSince === null) {
      throw this.buildValidationError(
        TAX_PKP_SINCE_REQUIRED_ERROR_CODE,
        'pkpSince',
        'A PKP clinic must record the date it was registered',
      );
    }
    if (typeof params.input.nitku === 'string') {
      this.assertNitkuExtendsNpwp(params.input.nitku, params.taxId);
    }
  }

  /**
   * Judged only when the request touches the regime, the legal form or the
   * start year. A period that ends while nobody edits it must not block the
   * clinic from changing its pricing mode; the page shows the end year instead.
   */
  private assertPp55Eligible(merged: SaveTaxSettingsPayload, input: UpdateTaxSettingsInput): void {
    const isTouched =
      input.incomeTaxRegime !== undefined ||
      input.taxpayerType !== undefined ||
      input.pp55StartYear !== undefined;
    if (!isTouched || merged.incomeTaxRegime !== 'PP55_FINAL') {
      return;
    }
    const eligibility = resolvePp55Eligibility({
      taxpayerType: merged.taxpayerType,
      startYear: merged.pp55StartYear,
      currentYear: this.resolveCurrentYear(),
    });
    if (!eligibility.isEligible) {
      throw this.buildValidationError(
        TAX_PP55_NOT_ELIGIBLE_ERROR_CODE,
        'incomeTaxRegime',
        eligibility.reason,
      );
    }
  }

  /** NITKU is the NPWP plus a place-of-business suffix, so it cannot precede one. */
  private assertNitkuExtendsNpwp(nitku: string, taxId: string | null): void {
    if (resolveNpwpStatus(taxId) !== 'VALID') {
      throw this.buildValidationError(
        TAX_NITKU_NPWP_MISMATCH_ERROR_CODE,
        'nitku',
        `Record the clinic's ${NPWP_DIGIT_COUNT}-digit NPWP on the clinic profile first`,
      );
    }
    if (!nitku.startsWith(normalizeNpwp(taxId ?? ''))) {
      throw this.buildValidationError(
        TAX_NITKU_NPWP_MISMATCH_ERROR_CODE,
        'nitku',
        `The first ${NPWP_DIGIT_COUNT} digits of the NITKU must be the clinic's NPWP`,
      );
    }
  }

  private async recordChanges(
    previous: TaxSettingsRecord,
    saved: TaxSettingsRecord,
    actor: CurrentUser,
  ): Promise<void> {
    const changes = Object.fromEntries(
      AUDITED_FIELDS.filter((field) => previous[field] !== saved[field]).map((field) => [
        field,
        { from: previous[field], to: saved[field] },
      ]),
    );
    if (Object.keys(changes).length === 0) {
      return;
    }
    await this.auditService.record({
      action: 'TAX_SETTINGS_UPDATED',
      resource: TAX_SETTINGS_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      metadata: { changes },
    });
  }

  private buildValidationError(code: string, field: string, message: string): BadRequestException {
    return new BadRequestException({ code, message, errors: { [field]: message } });
  }

  private resolveCurrentYear(): number {
    const today = getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
    return Number(today.slice(0, CALENDAR_YEAR_LENGTH));
  }

  private toView(record: TaxSettingsRecord, taxId: string | null): TaxSettingsView {
    const lastEligibleYear =
      record.incomeTaxRegime === 'PP55_FINAL'
        ? resolvePp55Eligibility({
            taxpayerType: record.taxpayerType,
            startYear: record.pp55StartYear,
            currentYear: this.resolveCurrentYear(),
          }).lastEligibleYear
        : null;
    return {
      taxpayerType: record.taxpayerType ?? undefined,
      incomeTaxRegime: record.incomeTaxRegime,
      pp55StartYear: record.pp55StartYear ?? undefined,
      pp55LastEligibleYear: lastEligibleYear ?? undefined,
      isPkp: record.isPkp,
      pkpSince: record.pkpSince ?? undefined,
      nitku: record.nitku ?? undefined,
      pricesIncludeTax: record.pricesIncludeTax,
      npwp: taxId ?? undefined,
      npwpStatus: resolveNpwpStatus(taxId),
      updatedById: record.updatedById ?? undefined,
      updatedAt: record.updatedAt ? record.updatedAt.toISOString() : undefined,
    };
  }
}
