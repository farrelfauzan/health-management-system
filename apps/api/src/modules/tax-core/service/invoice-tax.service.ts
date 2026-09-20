import {
  ComputeInvoiceLineTaxesParams,
  InvoiceLineTax,
  InvoiceLineTaxInput,
  InvoiceLineTaxesResult,
  ResolveLineTaxParams,
  TaxCodeOverrides,
  computeLineTax,
  resolveEffectiveTaxCode,
  resolveTaxRate,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { FeatureAvailabilityCacheService } from '../../feature-entitlement/service/feature-availability-cache.service';
import { TaxAssignmentRepository } from '../repository/tax-assignment.repository';
import { TaxCodeService } from './tax-code.service';
import { TaxProfileService } from './tax-profile.service';

/** A clinic without the tax module taxes nothing and refuses nothing. */
const UNTAXED_LINE: InvoiceLineTax = {
  taxCode: null,
  ppnTreatment: null,
  fakturTransactionCode: null,
  taxableAmount: null,
  taxBase: null,
  taxRatePercent: null,
  taxAmount: 0,
  isResolved: true,
};

/**
 * The PPN on invoice lines (P27-T04, `docs/post-mvp/decisions.md` D-038).
 *
 * A line is taxed under its tariff's or medication's own code, else the
 * default for its item type — the invoice item types are exactly the default
 * targets. The rate is the one in force on the day asked for: billing asks with
 * today while the invoice is a draft and again at issue, and what issue stores
 * is never recomputed. Prices are tax-inclusive, so the PPN is carved out of
 * the line total and the total never moves.
 */
@Injectable()
export class InvoiceTaxService {
  constructor(
    private readonly taxCodeService: TaxCodeService,
    private readonly taxProfileService: TaxProfileService,
    private readonly taxAssignmentRepository: TaxAssignmentRepository,
    private readonly featureAvailabilityCache: FeatureAvailabilityCacheService,
  ) {}

  async computeLineTaxes<TLine extends InvoiceLineTaxInput>(
    params: ComputeInvoiceLineTaxesParams<TLine>,
  ): Promise<InvoiceLineTaxesResult<TLine>> {
    if (!(await this.featureAvailabilityCache.isEnabled('taxes'))) {
      return {
        lines: params.lines.map((line) => ({ ...line, tax: UNTAXED_LINE })),
        taxAmount: 0,
        isPkp: false,
      };
    }
    const [catalog, settings, overrides] = await Promise.all([
      this.taxCodeService.getTaxCodeCatalog(),
      this.taxProfileService.getTaxSettings(),
      this.findOverrides(params.lines),
    ]);
    const lines = params.lines.map((line) => ({
      ...line,
      tax: this.computeOne({
        line,
        catalog,
        overrides,
        isPkp: settings.isPkp,
        onDate: params.onDate,
      }),
    }));
    return {
      lines,
      taxAmount: lines.reduce((sum, line) => sum + line.tax.taxAmount, 0),
      isPkp: settings.isPkp,
    };
  }

  private computeOne(params: ResolveLineTaxParams): InvoiceLineTax {
    const { line, catalog, overrides } = params;
    const effective = resolveEffectiveTaxCode({
      overrideTaxCodeId:
        (line.serviceTariffId
          ? overrides.byServiceTariffId.get(line.serviceTariffId)
          : undefined) ??
        (line.medicationId ? overrides.byMedicationId.get(line.medicationId) : undefined) ??
        null,
      defaultTaxCodeId: catalog.defaultCodeIdByTarget.get(line.itemType) ?? null,
    });
    const taxCode = effective.taxCodeId
      ? (catalog.codesById.get(effective.taxCodeId) ?? null)
      : null;
    const rate = taxCode ? resolveTaxRate({ rates: taxCode.rates, onDate: params.onDate }) : null;
    return computeLineTax({ amount: line.amount, taxCode, rate, isPkp: params.isPkp });
  }

  private findOverrides(lines: readonly InvoiceLineTaxInput[]): Promise<TaxCodeOverrides> {
    const idsOf = (pick: (line: InvoiceLineTaxInput) => string | null | undefined): string[] => [
      ...new Set(lines.flatMap((line) => (pick(line) ? [pick(line) as string] : []))),
    ];
    return this.taxAssignmentRepository.findTaxCodeOverrides({
      serviceTariffIds: idsOf((line) => line.serviceTariffId),
      medicationIds: idsOf((line) => line.medicationId),
    });
  }
}
