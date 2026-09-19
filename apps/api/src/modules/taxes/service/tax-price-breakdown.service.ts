import {
  BuildTaxPriceBreakdownParams,
  ListTaxPriceBreakdownsQuery,
  TaxPriceBreakdownView,
  computeLineTax,
  getCalendarDateInTimeZone,
  resolveEffectiveTaxCode,
  resolveTaxRate,
  toTaxDefaultTarget,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TaxAssignmentRepository } from '../../tax-core/repository/tax-assignment.repository';
import { TaxCodeService } from '../../tax-core/service/tax-code.service';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

/**
 * The price before PPN and the PPN inside it, for the tariffs or medicines on
 * one list page (P27-T04). Computed with the same rule an invoice line uses at
 * today's rate, so the admin sees what the next bill will carry. The patient
 * never sees these figures: their receipt shows one price and a note.
 */
@Injectable()
export class TaxPriceBreakdownService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly taxAssignmentRepository: TaxAssignmentRepository,
    private readonly taxCodeService: TaxCodeService,
    private readonly taxProfileService: TaxProfileService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async listPriceBreakdowns(query: ListTaxPriceBreakdownsQuery): Promise<TaxPriceBreakdownView[]> {
    const [targets, catalog, settings] = await Promise.all([
      this.taxAssignmentRepository.findAssignmentTargets(query.kind, query.ids),
      this.taxCodeService.getTaxCodeCatalog(),
      this.taxProfileService.getTaxSettings(),
    ]);
    const onDate = getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
    return targets.map((target) =>
      this.buildBreakdown({ target, catalog, isPkp: settings.isPkp, onDate }),
    );
  }

  private buildBreakdown(params: BuildTaxPriceBreakdownParams): TaxPriceBreakdownView {
    const { target, catalog } = params;
    const effective = resolveEffectiveTaxCode({
      overrideTaxCodeId: target.taxCodeId,
      defaultTaxCodeId:
        catalog.defaultCodeIdByTarget.get(toTaxDefaultTarget(target.kind, target.category)) ?? null,
    });
    const taxCode = effective.taxCodeId
      ? (catalog.codesById.get(effective.taxCodeId) ?? null)
      : null;
    const identity = {
      kind: target.kind,
      id: target.id,
      taxCode: taxCode?.code,
      ppnTreatment: taxCode?.ppnTreatment,
    };
    if (target.price === null) {
      return { ...identity, status: 'UNPRICED' };
    }
    const rate = taxCode ? resolveTaxRate({ rates: taxCode.rates, onDate: params.onDate }) : null;
    const tax = computeLineTax({ amount: target.price, taxCode, rate, isPkp: params.isPkp });
    const figures = { price: target.price, priceBeforeTax: tax.taxableAmount ?? undefined };
    if (!tax.isResolved) {
      return { ...identity, status: 'UNRESOLVED', price: target.price };
    }
    if (tax.ppnTreatment !== 'STANDARD') {
      return { ...identity, ...figures, status: 'EXEMPT', taxAmount: 0 };
    }
    return params.isPkp
      ? { ...identity, ...figures, status: 'TAXED', taxAmount: tax.taxAmount }
      : { ...identity, ...figures, status: 'NOT_PKP', taxAmount: 0 };
  }
}
