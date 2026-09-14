import type { SatusehatServiceClassValue } from '#satusehat/schemas';

const SERVICE_CLASS_CODES: Readonly<Record<SatusehatServiceClassValue, string>> = {
  CLASS_1: '1',
  CLASS_2: '2',
  CLASS_3: '3',
  VIP: 'vip',
  VVIP: 'vvip',
};

/**
 * The code a room class is sent as in
 * `http://terminology.kemkes.go.id/CodeSystem/locationServiceClass-Inpatient`
 * (P24-T05, FR-LOC-05). `null` for an unmapped class: guessing one would report
 * a ward as a class the clinic never said it was.
 */
export function resolveSatusehatServiceClassCode(
  serviceClass: SatusehatServiceClassValue | null,
): string | null {
  return serviceClass === null ? null : SERVICE_CLASS_CODES[serviceClass];
}
