import type { SatusehatKycDisabledReasonValue } from '@hms/shared-types';

/**
 * The copy key for each reason the button is disabled (FR-KYC-07). The eight
 * deployment reasons collapse to two messages — "not configured" and "keys
 * not configured" — because the operator at the desk can act on neither; the
 * exact code is for the administrator, who reads it on the integrations
 * screen. The two operator reasons each get their own line.
 */
export type SatusehatKycDisabledKey =
  | 'notConfigured'
  | 'keysNotConfigured'
  | 'operatorNikMissing'
  | 'operatorNameMissing';

export function resolveSatusehatKycDisabledKey(
  reason: SatusehatKycDisabledReasonValue,
): SatusehatKycDisabledKey {
  switch (reason) {
    case 'SATUSEHAT_NOT_CONFIGURED':
      return 'notConfigured';
    case 'OPERATOR_NIK_MISSING':
      return 'operatorNikMissing';
    case 'OPERATOR_NAME_MISSING':
      return 'operatorNameMissing';
    default:
      return 'keysNotConfigured';
  }
}
