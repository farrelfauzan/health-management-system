/** What the immunisation form holds before it becomes a request (P24-T12). */
export type ImmunizationDraft = {
  medicationId: string;
  reason: string;
  isHistorical: boolean;
  lotNumber: string;
  expirationDate: string;
  doseNumber: string;
  route: string;
  site: string;
};
