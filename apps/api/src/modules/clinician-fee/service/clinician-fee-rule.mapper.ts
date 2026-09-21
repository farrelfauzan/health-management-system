import {
  ClinicianFeeRuleDetailRecord,
  ClinicianFeeRuleLevelValue,
  ClinicianFeeRuleView,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

function resolveRuleLevel(rule: ClinicianFeeRuleDetailRecord): ClinicianFeeRuleLevelValue {
  if (rule.serviceTariffId !== null) {
    return rule.doctorId === null ? 'TARIFF' : 'CLINICIAN_TARIFF';
  }
  return rule.doctorId === null ? 'CATEGORY' : 'CLINICIAN_CATEGORY';
}

/** Rule records to the API shape: absent rather than null, ISO timestamps. */
@Injectable()
export class ClinicianFeeRuleMapper {
  toView(rule: ClinicianFeeRuleDetailRecord): ClinicianFeeRuleView {
    return {
      id: rule.id,
      level: resolveRuleLevel(rule),
      serviceTariffId: rule.serviceTariffId ?? undefined,
      serviceTariffCode: rule.serviceTariff?.code,
      serviceTariffName: rule.serviceTariff?.name,
      category: rule.category ?? rule.serviceTariff?.category,
      doctorId: rule.doctorId ?? undefined,
      doctorName: rule.doctor?.fullName,
      doctorProfession: rule.doctor?.profession,
      mode: rule.mode,
      value: rule.value,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo ?? undefined,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}
