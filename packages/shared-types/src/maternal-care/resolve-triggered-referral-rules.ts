import { ANTENATAL_REFERRAL_RULES } from '#maternal-care/antenatal-referral-rules';
import type {
  AntenatalReferralRuleInput,
  TriggeredAntenatalReferralRule,
} from '#maternal-care/types';

/**
 * Which sourced referral prompts this visit's findings set off (P25-T07,
 * FR-ANC-04), each carrying the reason it was dismissed when the midwife has
 * already set it aside.
 *
 * A dismissed rule is returned rather than filtered out: the banner is what
 * the record is judged against later, and a prompt that vanished when it was
 * acknowledged would leave the next reader unable to tell an oversight from a
 * decision. Nothing is ever blocked either way.
 *
 * The rule list is currently empty for want of a readable primary source, so
 * this returns nothing today. It is still the seam every rule will arrive
 * through.
 */
export function resolveTriggeredReferralRules(params: {
  input: AntenatalReferralRuleInput;
  dismissedReasonsByRuleCode: Readonly<Record<string, string>>;
}): TriggeredAntenatalReferralRule[] {
  return ANTENATAL_REFERRAL_RULES.filter((rule) => rule.isTriggered(params.input)).map((rule) => ({
    code: rule.code,
    label: rule.label,
    source: rule.source,
    dismissedReason: params.dismissedReasonsByRuleCode[rule.code] ?? null,
  }));
}
