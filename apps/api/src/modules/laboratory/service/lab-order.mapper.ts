import {
  LabOrderItemRecord,
  LabOrderItemView,
  LabOrderListItem,
  LabOrderListRecord,
  LabOrderRecord,
  LabOrderSummary,
  LabOrderView,
  LabSpecimenRecord,
  LabSpecimenView,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

/** Turns lab order records into the wire shapes, dropping nulls to absent. */
@Injectable()
export class LabOrderMapper {
  toLabOrderView(record: LabOrderRecord): LabOrderView {
    return {
      ...this.toOrderHeader(record),
      items: record.items.map((item) => this.toLabOrderItemView(item)),
      specimens: record.specimens.map((specimen) => this.toLabSpecimenView(specimen)),
    };
  }

  toLabOrderListItem(record: LabOrderListRecord): LabOrderListItem {
    return {
      ...this.toOrderHeader(record),
      itemCount: record.itemCount,
      patientName: record.patientName,
      patientMrn: record.patientMrn,
    };
  }

  /** What the encounter record shows: that work was asked for, and where it got to. */
  toLabOrderSummary(record: LabOrderRecord): LabOrderSummary {
    return {
      id: record.id,
      orderNumber: record.orderNumber,
      status: record.status,
      priority: record.priority,
      itemCount: record.items.length,
      orderedAt: record.orderedAt.toISOString(),
    };
  }

  toLabOrderItemView(record: LabOrderItemRecord): LabOrderItemView {
    return {
      id: record.id,
      labTestId: record.labTestId,
      code: record.code,
      name: record.name,
      specimenType: record.specimenType,
      resultType: record.resultType,
      status: record.status,
      panelId: record.panelId ?? undefined,
      panelName: record.panelName ?? undefined,
      specimenId: record.specimenId ?? undefined,
    };
  }

  toLabSpecimenView(record: LabSpecimenRecord): LabSpecimenView {
    return {
      id: record.id,
      labOrderId: record.labOrderId,
      specimenType: record.specimenType,
      accessionNumber: record.accessionNumber,
      collectedAt: record.collectedAt.toISOString(),
      collectedById: record.collectedById,
      receivedAt: record.receivedAt?.toISOString(),
      status: record.status,
      rejectedAt: record.rejectedAt?.toISOString(),
      rejectReason: record.rejectReason ?? undefined,
      rejectNotes: record.rejectNotes ?? undefined,
      notes: record.notes ?? undefined,
    };
  }

  private toOrderHeader(record: Omit<LabOrderRecord, 'items' | 'specimens'>) {
    return {
      id: record.id,
      orderNumber: record.orderNumber,
      encounterId: record.encounterId,
      patientId: record.patientId,
      orderedById: record.orderedById,
      orderedByName: record.orderedByName,
      status: record.status,
      priority: record.priority,
      clinicalNotes: record.clinicalNotes ?? undefined,
      isFasting: record.isFasting,
      fulfilmentSite: record.fulfilmentSite,
      chargeMode: record.chargeMode,
      externalFacilityName: record.externalFacilityName ?? undefined,
      recollectCount: record.recollectCount,
      orderedAt: record.orderedAt.toISOString(),
      cancelledAt: record.cancelledAt?.toISOString(),
      cancelReason: record.cancelReason ?? undefined,
      releasedAt: record.releasedAt?.toISOString(),
    };
  }
}
