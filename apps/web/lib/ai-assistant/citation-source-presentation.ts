import type { RetrievalSourceTierValue } from '@hms/shared-types';

/**
 * How a citation's origin is presented.
 *
 * `icon` and `labelKey` carry the distinction together, and both are required:
 * colour alone would fail for a reader with a colour-vision deficiency, and on
 * a printed or screenshotted transcript it disappears entirely. The tone is a
 * third, redundant cue rather than the signal itself.
 */
export type CitationSourcePresentation = {
  icon: string;
  labelKey: 'clinic' | 'personal';
  toneClassName: string;
};

const PRESENTATION_BY_TIER: Record<RetrievalSourceTierValue, CitationSourcePresentation> = {
  CLINIC: {
    icon: 'domain',
    labelKey: 'clinic',
    toneClassName: 'border-sky-300 bg-sky-50 text-sky-900',
  },
  PERSONAL: {
    icon: 'person',
    labelKey: 'personal',
    toneClassName: 'border-violet-300 bg-violet-50 text-violet-900',
  },
};

/**
 * Falls back to the personal presentation for an unrecognised tier, which is
 * the safer direction: mislabelling a doctor's own upload as clinic policy
 * would lend it authority the clinic never gave it, while the reverse only
 * understates a document the reader already trusts.
 */
export function resolveCitationSourcePresentation(
  sourceTier: RetrievalSourceTierValue,
): CitationSourcePresentation {
  return PRESENTATION_BY_TIER[sourceTier] ?? PRESENTATION_BY_TIER.PERSONAL;
}
