import {
  ChargeModeValue,
  FulfilmentSiteValue,
  LabOrderItemStatusValue,
  LabOrderPriorityValue,
  LabOrderStatusValue,
  LabResultTypeValue,
  LabSpecimenRejectReasonValue,
  LabSpecimenStatusValue,
  LabSpecimenTypeValue,
} from '@hms/shared-types';

/**
 * Persistence-shaped rows for lab orders and specimens — the include shapes the
 * repository asks Prisma for, named so the mappers below have something to
 * accept. Adapter internals, and therefore in `apps/api` rather than in
 * `@hms/shared-types`, the same exception `lab-catalog-row.types.ts` takes.
 */
export type LabSpecimenRow = {
  id: string;
  labOrderId: string;
  specimenType: LabSpecimenTypeValue;
  accessionNumber: string;
  collectedAt: Date;
  collectedById: string;
  receivedAt: Date | null;
  status: LabSpecimenStatusValue;
  rejectedAt: Date | null;
  rejectReason: LabSpecimenRejectReasonValue | null;
  rejectNotes: string | null;
  notes: string | null;
};

export type LabOrderItemRow = {
  id: string;
  labTestId: string;
  status: LabOrderItemStatusValue;
  panelId: string | null;
  specimenId: string | null;
  labTest: {
    code: string;
    name: string;
    specimenType: LabSpecimenTypeValue;
    resultType: LabResultTypeValue;
  };
  panel: { name: string } | null;
};

export type LabOrderRow = {
  id: string;
  orderNumber: string;
  encounterId: string;
  patientId: string;
  orderedById: string;
  status: LabOrderStatusValue;
  priority: LabOrderPriorityValue;
  clinicalNotes: string | null;
  isFasting: boolean;
  fulfilmentSite: FulfilmentSiteValue;
  chargeMode: ChargeModeValue;
  externalFacilityName: string | null;
  recollectCount: number;
  orderedAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  releasedAt: Date | null;
  orderedBy: { fullName: string; licenseNumber?: string | null };
  items: LabOrderItemRow[];
  specimens: LabSpecimenRow[];
};

export type LabOrderListRow = Omit<LabOrderRow, 'items' | 'specimens'> & {
  patient: { fullName: string; mrn: string };
  _count: { items: number };
};

export type LabWorklistRow = Omit<LabOrderRow, 'items'> & {
  patient: {
    id: string;
    fullName: string;
    mrn: string;
    dateOfBirth: Date;
    sex: 'MALE' | 'FEMALE';
    bpjsNumberIndex: string | null;
  };
  _count: { items: number };
};
