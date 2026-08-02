/**
 * A prescription line the doctor has staged in the encounter workspace but not
 * yet submitted. The medication name and code are kept alongside the id so the
 * draft list can render without re-querying the catalog.
 */
export type PrescriptionDraftItem = {
  medicationId: string;
  medicationCode: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  durationDays?: number;
  quantity: number;
  instructions?: string;
};
