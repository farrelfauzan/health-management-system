import type { ClinicianFeeRuleLevelValue } from '#clinician-fee/schemas';
import type {
  ClinicianFeeRuleRecord,
  ResolveClinicianFeeRuleParams,
  ResolvedClinicianFeeRule,
} from '#clinician-fee/types';

type RuleLevelMatcher = {
  level: ClinicianFeeRuleLevelValue;
  matches: (rule: ClinicianFeeRuleRecord, params: ResolveClinicianFeeRuleParams) => boolean;
};

/** Most specific first (P27-T06): the first level with a rule in force wins. */
const RULE_LEVEL_MATCHERS: readonly RuleLevelMatcher[] = [
  {
    level: 'CLINICIAN_TARIFF',
    matches: (rule, params) =>
      params.serviceTariffId !== null &&
      rule.serviceTariffId === params.serviceTariffId &&
      rule.doctorId === params.doctorId,
  },
  {
    level: 'TARIFF',
    matches: (rule, params) =>
      params.serviceTariffId !== null &&
      rule.serviceTariffId === params.serviceTariffId &&
      rule.doctorId === null,
  },
  {
    level: 'CLINICIAN_CATEGORY',
    matches: (rule, params) =>
      params.category !== null &&
      rule.category === params.category &&
      rule.doctorId === params.doctorId,
  },
  {
    level: 'CATEGORY',
    matches: (rule, params) =>
      params.category !== null && rule.category === params.category && rule.doctorId === null,
  },
];

function isRuleInForce(rule: ClinicianFeeRuleRecord, onDate: string): boolean {
  return rule.effectiveFrom <= onDate && (rule.effectiveTo === null || onDate <= rule.effectiveTo);
}

function pickLatestRule(
  current: ClinicianFeeRuleRecord | null,
  rule: ClinicianFeeRuleRecord,
): ClinicianFeeRuleRecord {
  return current === null || rule.effectiveFrom > current.effectiveFrom ? rule : current;
}

/**
 * The jasa medis rule for one paid line (P27-T06): clinician + tariff, then
 * tariff, then clinician + category, then category, each among the rules in
 * force on the clinic-local payment day. Rules at one level should not
 * overlap — the service refuses it — but if two do, the later start wins so
 * the answer is still deterministic. `null` when no rule applies: the line
 * earns the clinician nothing and writes no entry.
 */
export function resolveClinicianFeeRule(
  params: ResolveClinicianFeeRuleParams,
): ResolvedClinicianFeeRule | null {
  const inForce = params.rules.filter((rule) => isRuleInForce(rule, params.onDate));
  for (const matcher of RULE_LEVEL_MATCHERS) {
    const rule = inForce
      .filter((candidate) => matcher.matches(candidate, params))
      .reduce<ClinicianFeeRuleRecord | null>(pickLatestRule, null);
    if (rule !== null) {
      return { rule, level: matcher.level };
    }
  }
  return null;
}
