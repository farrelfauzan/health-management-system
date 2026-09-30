/** The five outcomes of an issued prescription, in the order the flow card shows them. */
export const PRESCRIPTION_FLOW_STATUSES = [
  'fullyDispensed',
  'partiallyDispensed',
  'awaitingDispense',
  'filledElsewhere',
  'cancelled',
] as const;

export type PrescriptionFlowStatus = (typeof PRESCRIPTION_FLOW_STATUSES)[number];
