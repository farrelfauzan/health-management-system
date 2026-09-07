import {
  CollectLabSpecimenPayload,
  CollectLabSpecimensInput,
  LabOrderRecord,
  LabSpecimenLabel,
  LabSpecimenRecord,
  LabSpecimenTypeValue,
  LabSpecimenView,
  LabWorklistItem,
  LabWorklistPatient,
  LabWorklistOrderRecord,
  LabWorklistQuery,
  RejectLabSpecimenInput,
  getStartOfCalendarDateInTimeZone,
} from '@hms/shared-types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { LabOrderRepository } from '../repository/lab-order.repository';
import { LabSpecimenRepository } from '../repository/lab-specimen.repository';
import { LabOrderMapper } from './lab-order.mapper';
import { LabPaymentGateService } from './lab-payment-gate.service';
import { WORKLIST_STATUSES_BY_BUCKET } from './lab-worklist-buckets';
import { toPatientAgeYears } from './to-patient-age-years';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

const DAY_IN_MILLISECONDS = 86_400_000;

/** Nothing can be drawn for an order that is finished or withdrawn. */
const COLLECTABLE_STATUSES = ['ORDERED', 'COLLECTED'] as const;

/**
 * The sample: who drew it, when, which tube, and whether it was fit to analyse.
 *
 * Collection derives the tubes rather than letting the caller name them — one
 * specimen per distinct specimen type among the still-pending items, because a
 * single EDTA tube serves the whole darah rutin and asking an analis to say so
 * every morning is how mislabelled tubes happen.
 */
@Injectable()
export class LabSpecimenService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly labSpecimenRepository: LabSpecimenRepository,
    private readonly labOrderRepository: LabOrderRepository,
    private readonly labOrderMapper: LabOrderMapper,
    private readonly labPaymentGateService: LabPaymentGateService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async collectLabSpecimens(
    labOrderId: string,
    payload: CollectLabSpecimensInput,
    currentUser: CurrentUser,
  ): Promise<LabSpecimenView[]> {
    const order = await this.findLabOrderOrThrow(labOrderId);
    this.assertCollectable(order);
    await this.labPaymentGateService.assertCollectionIsPaidFor(order);
    const specimens = this.planSpecimens(order);
    if (specimens.length === 0) {
      throw new ConflictException(
        `Every test on ${order.orderNumber} already has a specimen; reject the tube to draw again`,
      );
    }
    const collected = await this.labSpecimenRepository.collectLabSpecimens({
      labOrderId: order.id,
      collectedAt: payload.collectedAt ? new Date(payload.collectedAt) : new Date(),
      collectedById: currentUser.sub,
      notes: payload.notes ?? null,
      specimens,
    });
    await this.auditService.record({
      action: 'LAB_SPECIMEN_COLLECTED',
      resource: 'LabSpecimen',
      resourceId: order.id,
      actorUserId: currentUser.sub,
      patientId: order.patientId,
      metadata: {
        orderNumber: order.orderNumber,
        accessionNumbers: collected.map((specimen) => specimen.accessionNumber),
      },
    });

    return collected.map((specimen) => this.labOrderMapper.toLabSpecimenView(specimen));
  }

  /** Marks arrival at the bench. Optional: a clinic with one room draws and receives at once. */
  async receiveLabSpecimen(id: string, currentUser: CurrentUser): Promise<LabSpecimenView> {
    const specimen = await this.findLabSpecimenOrThrow(id);
    if (specimen.status !== 'COLLECTED') {
      throw new ConflictException(
        `Specimen ${specimen.accessionNumber} is ${specimen.status} and can not be received`,
      );
    }
    const received = await this.labSpecimenRepository.receiveLabSpecimen(id, new Date());
    await this.auditService.record({
      action: 'LAB_SPECIMEN_RECEIVED',
      resource: 'LabSpecimen',
      resourceId: id,
      actorUserId: currentUser.sub,
      metadata: { accessionNumber: specimen.accessionNumber },
    });

    return this.labOrderMapper.toLabSpecimenView(received);
  }

  /**
   * Discards a tube and sends the order back for a fresh draw. The rejected row
   * stays: the patient sat through that needle, and "which of these keeps
   * happening" is only answerable if the discarded draws are kept.
   */
  async rejectLabSpecimen(
    id: string,
    payload: RejectLabSpecimenInput,
    currentUser: CurrentUser,
  ): Promise<LabSpecimenView> {
    const specimen = await this.findLabSpecimenOrThrow(id);
    if (specimen.status === 'REJECTED') {
      throw new ConflictException(`Specimen ${specimen.accessionNumber} is already rejected`);
    }
    const rejected = await this.labSpecimenRepository.rejectLabSpecimen({
      id,
      labOrderId: specimen.labOrderId,
      rejectedAt: new Date(),
      rejectReason: payload.reason,
      rejectNotes: payload.notes ?? null,
    });
    await this.auditService.record({
      action: 'LAB_SPECIMEN_REJECTED',
      resource: 'LabSpecimen',
      resourceId: id,
      actorUserId: currentUser.sub,
      metadata: { accessionNumber: specimen.accessionNumber, reason: payload.reason },
    });

    return this.labOrderMapper.toLabSpecimenView(rejected);
  }

  async listWorklist(query: LabWorklistQuery): Promise<LabWorklistItem[]> {
    const orderedFrom = query.date ? this.toClinicDayStart(query.date) : undefined;
    const records = await this.labOrderRepository.listWorklist({
      statuses: WORKLIST_STATUSES_BY_BUCKET[query.bucket],
      orderedFrom,
      orderedTo: orderedFrom
        ? new Date(orderedFrom.getTime() + DAY_IN_MILLISECONDS)
        : undefined,
    });
    const awaitingPaymentOrderIds =
      await this.labPaymentGateService.findOrderIdsAwaitingPayment(records);

    return records.map((record) =>
      this.toWorklistItem(record, awaitingPaymentOrderIds.has(record.id)),
    );
  }

  /**
   * The label's content — never its layout. Printing is a browser print of a
   * 50×25 mm CSS page (P18-T08), so the API supplies the values a barcode and
   * a human both need to match tube to person.
   */
  async getSpecimenLabel(id: string): Promise<LabSpecimenLabel> {
    const specimen = await this.findLabSpecimenOrThrow(id);
    const order = await this.labOrderRepository.findWorklistOrderById(specimen.labOrderId);

    if (!order) {
      throw new NotFoundException('Lab order not found');
    }

    return {
      accessionNumber: specimen.accessionNumber,
      orderNumber: order.orderNumber,
      specimenType: specimen.specimenType,
      collectedAt: specimen.collectedAt.toISOString(),
      patient: this.toWorklistPatient(order),
    };
  }

  /**
   * One tube per distinct specimen type among the items still waiting for one.
   * Items already linked to a live tube are skipped, so collecting again after
   * a partial rejection draws only what is missing.
   */
  private planSpecimens(order: LabOrderRecord): CollectLabSpecimenPayload[] {
    const itemIdsByType = new Map<LabSpecimenTypeValue, string[]>();
    for (const item of order.items) {
      if (item.status !== 'PENDING' || item.specimenId !== null) {
        continue;
      }
      const existing = itemIdsByType.get(item.specimenType) ?? [];
      existing.push(item.id);
      itemIdsByType.set(item.specimenType, existing);
    }

    return [...itemIdsByType.entries()].map(([specimenType, labOrderItemIds]) => ({
      specimenType,
      labOrderItemIds,
    }));
  }

  private toWorklistItem(record: LabWorklistOrderRecord, isAwaitingPayment: boolean): LabWorklistItem {
    return {
      id: record.id,
      orderNumber: record.orderNumber,
      status: record.status,
      priority: record.priority,
      isFasting: record.isFasting,
      recollectCount: record.recollectCount,
      orderedAt: record.orderedAt.toISOString(),
      clinicalNotes: record.clinicalNotes ?? undefined,
      patient: this.toWorklistPatient(record),
      itemCount: record.itemCount,
      specimens: record.specimens.map((specimen) =>
        this.labOrderMapper.toLabSpecimenView(specimen),
      ),
      isAwaitingPayment,
    };
  }

  private toWorklistPatient(record: LabWorklistOrderRecord): LabWorklistPatient {
    return {
      id: record.patient.id,
      fullName: record.patient.fullName,
      mrn: record.patient.mrn,
      dateOfBirth: record.patient.dateOfBirth.toISOString().slice(0, 10),
      sex: record.patient.sex,
      ageYears: toPatientAgeYears(record.patient.dateOfBirth, new Date()),
    };
  }

  private assertCollectable(order: LabOrderRecord): void {
    // P18-T11. Another lab is drawing this one. It never reaches the worklist,
    // but the route is addressable by id, so the rule is stated here too rather
    // than left to the query that hides it.
    if (order.fulfilmentSite === 'EXTERNAL') {
      throw new ConflictException(
        `Lab order ${order.orderNumber} is being run by ${order.externalFacilityName ?? 'another facility'}; nothing is collected here`,
      );
    }
    if (!COLLECTABLE_STATUSES.some((status) => status === order.status)) {
      throw new ConflictException(
        `Lab order ${order.orderNumber} is ${order.status}; nothing can be collected for it`,
      );
    }
  }

  private async findLabOrderOrThrow(id: string): Promise<LabOrderRecord> {
    const order = await this.labOrderRepository.findLabOrderById(id);

    if (!order) {
      throw new NotFoundException('Lab order not found');
    }

    return order;
  }

  private async findLabSpecimenOrThrow(id: string): Promise<LabSpecimenRecord> {
    const specimen = await this.labSpecimenRepository.findLabSpecimenById(id);

    if (!specimen) {
      throw new NotFoundException('Lab specimen not found');
    }

    return specimen;
  }

  private toClinicDayStart(date: string): Date {
    return getStartOfCalendarDateInTimeZone(date, this.clinicTimeZone);
  }
}
