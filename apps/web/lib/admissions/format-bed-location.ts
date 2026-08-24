import type { AdmissionBedResponse } from '@hms/shared-types';

/**
 * A bed's full address, the way it is said on a ward round: ward, room, bed.
 *
 * Assembled here rather than in each cell because four screens render it — the
 * admissions table, the detail dialog, the bed picker and the transfer
 * confirmation — and a bed identified differently in two of them is a bed two
 * people think is two beds.
 */
export function formatBedLocation(bed: AdmissionBedResponse): string {
  return `${bed.ward.name} / ${bed.room.code} / ${bed.code}`;
}
