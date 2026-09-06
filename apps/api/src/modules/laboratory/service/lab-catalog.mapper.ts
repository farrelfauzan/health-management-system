import { LabPanelRecord, LabPanelView, LabTestRecord, LabTestView } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

/** Turns catalog records into the wire shapes, dropping nulls to absent. */
@Injectable()
export class LabCatalogMapper {
  toLabTestView(record: LabTestRecord): LabTestView {
    return {
      id: record.id,
      code: record.code,
      name: record.name,
      loincCode: record.loincCode ?? undefined,
      loincDisplay: record.loincDisplay ?? undefined,
      specimenType: record.specimenType,
      resultType: record.resultType,
      unit: record.unit ?? undefined,
      decimals: record.decimals,
      codedOptions: record.codedOptions,
      isActive: record.isActive,
      serviceTariffId: record.serviceTariffId ?? undefined,
      price: record.price ?? undefined,
      referenceRanges: record.referenceRanges.map((range) => ({
        id: range.id,
        sex: range.sex ?? undefined,
        ageMinDays: range.ageMinDays ?? undefined,
        ageMaxDays: range.ageMaxDays ?? undefined,
        low: range.low ?? undefined,
        high: range.high ?? undefined,
        criticalLow: range.criticalLow ?? undefined,
        criticalHigh: range.criticalHigh ?? undefined,
        textNormal: range.textNormal ?? undefined,
      })),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  toLabPanelView(record: LabPanelRecord): LabPanelView {
    return {
      id: record.id,
      code: record.code,
      name: record.name,
      isActive: record.isActive,
      serviceTariffId: record.serviceTariffId ?? undefined,
      price: record.price ?? undefined,
      members: record.members,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
