import {
  CreateTaxCodeInput,
  CreateTaxCodeRateInput,
  RecordTaxCodeChangeParams,
  TAX_CODE_CONFLICT_ERROR_CODE,
  TAX_CODE_FAKTUR_MISMATCH_ERROR_CODE,
  TAX_CODE_IN_USE_ERROR_CODE,
  TAX_CODE_INACTIVE_ERROR_CODE,
  TAX_CODE_SYSTEM_LOCKED_ERROR_CODE,
  TAX_RATE_NOT_AFTER_LATEST_ERROR_CODE,
  TAX_RATE_NOT_APPLICABLE_ERROR_CODE,
  TaxCategoryDefaultView,
  TaxCodeCatalog,
  TaxCodeRateView,
  TaxCodeRecord,
  TaxCodeUsageRecord,
  TaxCodeView,
  UpdateTaxCategoryDefaultsInput,
  UpdateTaxCodeInput,
  getCalendarDateInTimeZone,
  isFakturCodeAllowed,
  resolveTaxRate,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { TaxCodeConflictError } from '../repository/tax-code-conflict.error';
import { TaxCodeRepository } from '../repository/tax-code.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const TAX_CODE_AUDIT_RESOURCE = 'tax-code';
const EFFECTIVE_RATE_DECIMALS = 10_000;

/**
 * Tax codes, their effective-dated rates and the category defaults (P27-T03,
 * `docs/post-mvp/decisions.md` D-038).
 *
 * Three rules keep issued history explainable. A code's treatment is fixed at
 * creation; a system code keeps its faktur code too. Rates are appended, never
 * edited, each later than the last. And a code that anything still points at —
 * a default or a tariff or medication override — cannot be switched off.
 */
@Injectable()
export class TaxCodeService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly taxCodeRepository: TaxCodeRepository,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async listTaxCodeViews(): Promise<TaxCodeView[]> {
    const [codes, usage] = await Promise.all([
      this.taxCodeRepository.listTaxCodes(),
      this.taxCodeRepository.listTaxCodeUsage(),
    ]);
    const usageById = new Map(usage.map((entry) => [entry.taxCodeId, entry]));
    return codes.map((code) => this.toView(code, usageById.get(code.id)));
  }

  /** Codes and defaults in one read, for resolving many items at once. */
  async getTaxCodeCatalog(): Promise<TaxCodeCatalog> {
    const [codes, defaults] = await Promise.all([
      this.taxCodeRepository.listTaxCodes(),
      this.taxCodeRepository.listCategoryDefaults(),
    ]);
    return {
      codesById: new Map(codes.map((code) => [code.id, code])),
      defaultCodeIdByTarget: new Map(defaults.map((entry) => [entry.target, entry.taxCodeId])),
    };
  }

  /** The code, 404 if unknown and 409 `TAX_CODE_INACTIVE` if it is switched off. */
  async getActiveTaxCode(id: string): Promise<TaxCodeRecord> {
    const code = await this.findTaxCodeOrThrow(id);
    if (!code.isActive) {
      throw new ConflictException({
        code: TAX_CODE_INACTIVE_ERROR_CODE,
        message: `Tax code ${code.code} is inactive; reactivate it or choose another`,
      });
    }
    return code;
  }

  async createTaxCode(input: CreateTaxCodeInput, actor: CurrentUser): Promise<TaxCodeView> {
    try {
      const created = await this.taxCodeRepository.createTaxCode({
        code: input.code,
        name: input.name,
        ppnTreatment: input.ppnTreatment,
        fakturTransactionCode: input.fakturTransactionCode,
        invoiceNote: input.invoiceNote ?? null,
        coretaxItemCode: input.coretaxItemCode ?? null,
        coretaxUnitCode: input.coretaxUnitCode ?? null,
        coretaxAdditionalInfo: input.coretaxAdditionalInfo ?? null,
        coretaxFacilityStamp: input.coretaxFacilityStamp ?? null,
        initialRate: input.initialRate ?? null,
        createdById: actor.sub,
      });
      await this.recordChange({
        operation: 'CREATE',
        actorUserId: actor.sub,
        metadata: { taxCodeId: created.id, code: created.code, ppnTreatment: created.ppnTreatment },
      });
      return this.toView(created, undefined);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async updateTaxCode(
    id: string,
    input: UpdateTaxCodeInput,
    actor: CurrentUser,
  ): Promise<TaxCodeView> {
    const existing = await this.findTaxCodeOrThrow(id);
    this.assertFakturCodeChangeAllowed(existing, input);
    this.assertCoretaxFacilityAllowed(existing, input);
    const usage = await this.findUsage(id);
    if (input.isActive === false && existing.isActive) {
      this.assertNotInUse(existing, usage);
    }
    const updated = await this.taxCodeRepository.updateTaxCode(id, input);
    await this.recordChange({
      operation: 'UPDATE',
      actorUserId: actor.sub,
      metadata: { taxCodeId: id, code: existing.code, fields: Object.keys(input).sort() },
    });
    return this.toView(updated, usage);
  }

  async addTaxCodeRate(
    id: string,
    input: CreateTaxCodeRateInput,
    actor: CurrentUser,
  ): Promise<TaxCodeView> {
    const existing = await this.findTaxCodeOrThrow(id);
    this.assertRateCanBeAdded(existing, input);
    await this.taxCodeRepository.createTaxCodeRate({
      ...input,
      taxCodeId: id,
      createdById: actor.sub,
    });
    await this.recordChange({
      operation: 'ADD_RATE',
      actorUserId: actor.sub,
      metadata: { taxCodeId: id, code: existing.code, ...input },
    });
    const [updated, usage] = await Promise.all([this.findTaxCodeOrThrow(id), this.findUsage(id)]);
    return this.toView(updated, usage);
  }

  async listCategoryDefaultViews(): Promise<TaxCategoryDefaultView[]> {
    const catalog = await this.getTaxCodeCatalog();
    return [...catalog.defaultCodeIdByTarget.entries()].map(([target, taxCodeId]) => ({
      target,
      taxCodeId,
      taxCode: catalog.codesById.get(taxCodeId)?.code,
    }));
  }

  async updateCategoryDefaults(
    input: UpdateTaxCategoryDefaultsInput,
    actor: CurrentUser,
  ): Promise<TaxCategoryDefaultView[]> {
    const codeIds = input.defaults.flatMap((entry) => (entry.taxCodeId ? [entry.taxCodeId] : []));
    await Promise.all([...new Set(codeIds)].map((codeId) => this.getActiveTaxCode(codeId)));
    await this.taxCodeRepository.saveCategoryDefaults({
      defaults: input.defaults,
      updatedById: actor.sub,
    });
    await this.recordChange({
      operation: 'SET_DEFAULTS',
      actorUserId: actor.sub,
      metadata: { defaults: input.defaults },
    });
    return this.listCategoryDefaultViews();
  }

  /**
   * A system code's faktur code is what the code is; a clinic's own standard
   * code may move between 01 and 04. Either way the result must match the
   * stored treatment.
   */
  private assertFakturCodeChangeAllowed(existing: TaxCodeRecord, input: UpdateTaxCodeInput): void {
    const next = input.fakturTransactionCode;
    if (next === undefined || next === existing.fakturTransactionCode) {
      return;
    }
    if (existing.isSystem) {
      throw new ConflictException({
        code: TAX_CODE_SYSTEM_LOCKED_ERROR_CODE,
        message: `${existing.code} is a system code; only its name, note and active flag may change`,
      });
    }
    if (
      !isFakturCodeAllowed({ ppnTreatment: existing.ppnTreatment, fakturTransactionCode: next })
    ) {
      throw new BadRequestException({
        code: TAX_CODE_FAKTUR_MISMATCH_ERROR_CODE,
        message: 'That faktur code does not match this tax code treatment',
        errors: { fakturTransactionCode: 'Does not match the treatment' },
      });
    }
  }

  /**
   * The exemption facility is a kode-08 faktur field (P27-T09), refused on a
   * code that is not 08 after this update. Treatments are fixed, so an exempt
   * code never moves away from 08 and never strands a facility.
   */
  private assertCoretaxFacilityAllowed(existing: TaxCodeRecord, input: UpdateTaxCodeInput): void {
    const nextFakturCode =
      input.fakturTransactionCode === undefined
        ? existing.fakturTransactionCode
        : input.fakturTransactionCode;
    const setsFacility = Boolean(input.coretaxAdditionalInfo || input.coretaxFacilityStamp);
    if (!setsFacility || nextFakturCode === '08') {
      return;
    }
    throw new BadRequestException({
      code: TAX_CODE_FAKTUR_MISMATCH_ERROR_CODE,
      message: 'Only a kode-08 (exempt) tax code carries a keterangan tambahan and cap fasilitas',
      errors: { coretaxFacilityStamp: 'Only for faktur code 08' },
    });
  }

  private assertNotInUse(existing: TaxCodeRecord, usage: TaxCodeUsageRecord | undefined): void {
    if (!usage || (usage.defaultTargets.length === 0 && usage.overrideCount === 0)) {
      return;
    }
    throw new ConflictException({
      code: TAX_CODE_IN_USE_ERROR_CODE,
      message: `${existing.code} is still the default for ${usage.defaultTargets.length} categories and set on ${usage.overrideCount} items; move them first`,
      errors: { defaultTargets: usage.defaultTargets, overrideCount: usage.overrideCount },
    });
  }

  private assertRateCanBeAdded(existing: TaxCodeRecord, input: CreateTaxCodeRateInput): void {
    if (existing.ppnTreatment !== 'STANDARD') {
      throw new ConflictException({
        code: TAX_RATE_NOT_APPLICABLE_ERROR_CODE,
        message: `${existing.code} is not a taxed code, so it carries no rate`,
      });
    }
    const latest = existing.rates.at(-1);
    if (latest && input.effectiveFrom <= latest.effectiveFrom) {
      throw new ConflictException({
        code: TAX_RATE_NOT_AFTER_LATEST_ERROR_CODE,
        message: `A new rate must start after ${latest.effectiveFrom}, the latest one`,
      });
    }
  }

  private async findTaxCodeOrThrow(id: string): Promise<TaxCodeRecord> {
    const code = await this.taxCodeRepository.findTaxCodeById(id);
    if (!code) {
      throw new NotFoundException('Tax code not found');
    }
    return code;
  }

  private async findUsage(id: string): Promise<TaxCodeUsageRecord | undefined> {
    const usage = await this.taxCodeRepository.listTaxCodeUsage();
    return usage.find((entry) => entry.taxCodeId === id);
  }

  private async recordChange(params: RecordTaxCodeChangeParams): Promise<void> {
    await this.auditService.record({
      action: 'TAX_CODE_CHANGED',
      resource: TAX_CODE_AUDIT_RESOURCE,
      actorUserId: params.actorUserId,
      metadata: { operation: params.operation, ...params.metadata },
    });
  }

  private mapConflict(err: unknown): unknown {
    if (err instanceof TaxCodeConflictError) {
      return new ConflictException({ code: TAX_CODE_CONFLICT_ERROR_CODE, message: err.message });
    }
    return err;
  }

  private toView(code: TaxCodeRecord, usage: TaxCodeUsageRecord | undefined): TaxCodeView {
    const today = getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
    const currentRate = resolveTaxRate({ rates: code.rates, onDate: today });
    const rates = code.rates.map((rate) => this.toRateView(rate));
    return {
      id: code.id,
      code: code.code,
      name: code.name,
      ppnTreatment: code.ppnTreatment,
      fakturTransactionCode: code.fakturTransactionCode ?? undefined,
      invoiceNote: code.invoiceNote ?? undefined,
      coretaxItemCode: code.coretaxItemCode ?? undefined,
      coretaxUnitCode: code.coretaxUnitCode ?? undefined,
      coretaxAdditionalInfo: code.coretaxAdditionalInfo ?? undefined,
      coretaxFacilityStamp: code.coretaxFacilityStamp ?? undefined,
      isSystem: code.isSystem,
      isActive: code.isActive,
      currentRate: currentRate ? this.toRateView(currentRate) : undefined,
      rates,
      defaultTargets: usage?.defaultTargets ?? [],
      overrideCount: usage?.overrideCount ?? 0,
    };
  }

  private toRateView(rate: TaxCodeRecord['rates'][number]): TaxCodeRateView {
    const effective = (rate.ratePercent * rate.dppNumerator) / rate.dppDenominator;
    return {
      ...rate,
      effectiveRatePercent:
        Math.round(effective * EFFECTIVE_RATE_DECIMALS) / EFFECTIVE_RATE_DECIMALS,
    };
  }
}
