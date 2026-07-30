import {
  BillingDispensedItemRecord,
  BillingSourceEncounterRecord,
  canTransitionInvoiceStatus,
  CreateInvoiceItemPayload,
  getCalendarDateInTimeZone,
  InvoiceDetail,
  InvoiceGenerationGap,
  InvoiceListItem,
  InvoicesListMeta,
  InvoiceStatusValue,
  ServiceTariffRecord,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { GenerateInvoiceDto } from '../dto/generate-invoice.dto';
import { ListInvoicesQueryDto } from '../dto/list-invoices-query.dto';
import { RecordPaymentDto } from '../dto/record-payment.dto';
import { VoidInvoiceDto } from '../dto/void-invoice.dto';
import { BillingRepository } from '../repository/billing.repository';
import { ServiceTariffRepository } from '../repository/service-tariff.repository';
import { BillingMapper } from './billing.mapper';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

const CENTS_PER_RUPIAH_UNIT = 100;

function parseBillingDateOnly(value: string): Date {
  const [yearPart = '', monthPart = '', dayPart = ''] = value.split('-');
  return new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, Number(dayPart)));
}

function toCents(amount: number): number {
  return Math.round(amount * CENTS_PER_RUPIAH_UNIT);
}

function toRupiah(cents: number): number {
  return cents / CENTS_PER_RUPIAH_UNIT;
}

type CollectedItems = {
  items: CreateInvoiceItemPayload[];
  gaps: InvoiceGenerationGap[];
};

/**
 * The invoice lifecycle: generate from a finished encounter, issue, settle,
 * void. Generation auto-collects what the visit already recorded — the
 * consultation fee, coded procedures priced by tariff, and dispensed
 * medications — and reports what it could not price as gaps rather than
 * silently dropping it.
 */
@Injectable()
export class BillingService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly serviceTariffRepository: ServiceTariffRepository,
    private readonly billingMapper: BillingMapper,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async generateInvoice(
    payload: GenerateInvoiceDto,
    currentUser: CurrentUser,
  ): Promise<{ invoice: InvoiceDetail; gaps: InvoiceGenerationGap[] }> {
    const encounter = await this.findBillableEncounterOrThrow(payload.encounterId);
    await this.assertNoLiveInvoice(encounter.id);
    const dispensedItems = await this.billingRepository.findDispensedItemsByEncounterId(
      encounter.id,
    );
    const collected = await this.collectInvoiceItems({
      encounter,
      dispensedItems,
      consultationTariffId: payload.consultationTariffId,
    });
    const totalCents = collected.items.reduce((sum, item) => sum + toCents(item.amount), 0);
    const created = await this.billingRepository.createInvoiceWithItems({
      encounterId: encounter.id,
      patientId: encounter.patientId,
      createdById: currentUser.sub,
      invoiceDate: this.resolveClinicToday(),
      totalAmount: toRupiah(totalCents),
      items: collected.items,
    });

    return { invoice: this.billingMapper.toInvoiceDetail(created), gaps: collected.gaps };
  }

  async listInvoices(query: ListInvoicesQueryDto): Promise<{
    items: InvoiceListItem[];
    meta: InvoicesListMeta;
  }> {
    const result = await this.billingRepository.listInvoices({
      page: query.page,
      limit: query.limit,
      status: query.status,
      patientId: query.patientId,
      encounterId: query.encounterId,
      createdFrom: query.createdFrom ? parseBillingDateOnly(query.createdFrom) : undefined,
      createdTo: query.createdTo ? parseBillingDateOnly(query.createdTo) : undefined,
    });

    return {
      items: result.items.map((invoice) => this.billingMapper.toInvoiceListItem(invoice)),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async getInvoiceById(id: string): Promise<InvoiceDetail> {
    const detail = await this.billingRepository.findInvoiceDetailById(id);

    if (!detail) {
      throw new NotFoundException('Invoice not found');
    }

    return this.billingMapper.toInvoiceDetail(detail);
  }

  /** DRAFT → ISSUED: the document handed to the patient. From here it is corrected by voiding, never edited. */
  async issueInvoice(id: string): Promise<InvoiceDetail> {
    const invoice = await this.findInvoiceOrThrow(id);
    this.assertAllowedStatusTransition(invoice.status, 'ISSUED');
    const issued = await this.billingRepository.issueInvoice(id, new Date());

    return this.billingMapper.toInvoiceDetail(issued);
  }

  /**
   * Settles an ISSUED invoice. The client repeats the amount and it must equal
   * the stored total — a stale screen showing an outdated total fails loudly
   * instead of recording the wrong settlement.
   */
  async recordPayment(
    id: string,
    payload: RecordPaymentDto,
    currentUser: CurrentUser,
  ): Promise<InvoiceDetail> {
    const invoice = await this.findInvoiceOrThrow(id);
    this.assertAllowedStatusTransition(invoice.status, 'PAID');

    if (toCents(payload.amount) !== toCents(invoice.totalAmount)) {
      throw new BadRequestException(
        `Payment amount must equal the invoice total of ${invoice.totalAmount}`,
      );
    }

    const paid = await this.billingRepository.recordPayment({
      invoiceId: invoice.id,
      method: payload.method,
      amount: payload.amount,
      referenceNumber: payload.referenceNumber,
      notes: payload.notes,
      paidAt: new Date(),
      cashierId: currentUser.sub,
    });

    return this.billingMapper.toInvoiceDetail(paid);
  }

  /**
   * Retracts a DRAFT or ISSUED invoice with a reason, freeing the encounter
   * for a corrected reissue. PAID is terminal in v1 — refunds are out of
   * scope. Every void leaves an audit event naming who retracted what and why.
   */
  async voidInvoice(
    id: string,
    payload: VoidInvoiceDto,
    currentUser: CurrentUser,
  ): Promise<InvoiceDetail> {
    const invoice = await this.findInvoiceOrThrow(id);
    this.assertAllowedStatusTransition(invoice.status, 'VOID');
    const voided = await this.billingRepository.voidInvoice({
      id: invoice.id,
      voidedAt: new Date(),
      voidReason: payload.reason,
      voidedById: currentUser.sub,
    });
    await this.auditService.record({
      action: 'INVOICE_VOIDED',
      resource: 'Invoice',
      resourceId: invoice.id,
      actorUserId: currentUser.sub,
      metadata: {
        previousStatus: invoice.status,
      },
    });

    return this.billingMapper.toInvoiceDetail(voided);
  }

  private async collectInvoiceItems(params: {
    encounter: BillingSourceEncounterRecord;
    dispensedItems: BillingDispensedItemRecord[];
    consultationTariffId?: string;
  }): Promise<CollectedItems> {
    const { encounter, dispensedItems, consultationTariffId } = params;
    const items: CreateInvoiceItemPayload[] = [];
    const gaps: InvoiceGenerationGap[] = [];
    const consultation = await this.resolveConsultationSelection(consultationTariffId);
    if (consultation.item) {
      items.push(consultation.item);
    }
    if (consultation.gap) {
      gaps.push(consultation.gap);
    }
    const procedures = await this.collectProcedureItems(encounter);
    items.push(...procedures.items);
    gaps.push(...procedures.gaps);
    const medications = this.collectMedicationItems(dispensedItems);
    items.push(...medications.items);
    gaps.push(...medications.gaps);
    return { items, gaps };
  }

  /**
   * With one active CONSULTATION tariff the server picks it; with several the
   * caller must name one, and with none the fee is skipped and reported as a
   * gap — a clinic that has not priced consultations yet can still bill the
   * rest of the visit.
   */
  private async resolveConsultationSelection(consultationTariffId?: string): Promise<{
    item?: CreateInvoiceItemPayload;
    gap?: InvoiceGenerationGap;
  }> {
    if (consultationTariffId) {
      return { item: this.buildTariffItem(await this.findConsultationTariffOrThrow(consultationTariffId), 'CONSULTATION') };
    }
    const activeTariffs = await this.serviceTariffRepository.findActiveConsultationTariffs();
    if (activeTariffs.length === 0) {
      return {
        gap: {
          reason: 'NO_CONSULTATION_TARIFF',
          description: 'No active consultation tariff is configured',
        },
      };
    }
    if (activeTariffs.length > 1) {
      throw new BadRequestException(
        'Multiple active consultation tariffs exist; specify consultationTariffId',
      );
    }
    const [tariff] = activeTariffs;
    return { item: tariff ? this.buildTariffItem(tariff, 'CONSULTATION') : undefined };
  }

  /**
   * Repeated identical procedures (two injections) collapse into one line with
   * a quantity, priced by the active tariff mapped to their ICD-9-CM code.
   * A procedure with no tariff is a gap, never a silent omission.
   */
  private async collectProcedureItems(
    encounter: BillingSourceEncounterRecord,
  ): Promise<CollectedItems> {
    const items: CreateInvoiceItemPayload[] = [];
    const gaps: InvoiceGenerationGap[] = [];
    const quantityByCode = new Map<string, { quantity: number; display: string }>();
    for (const procedure of encounter.procedures) {
      const existing = quantityByCode.get(procedure.code);
      quantityByCode.set(procedure.code, {
        quantity: (existing?.quantity ?? 0) + 1,
        display: procedure.display,
      });
    }
    const tariffs = await this.serviceTariffRepository.findActiveTariffsByIcd9cmCodes([
      ...quantityByCode.keys(),
    ]);
    const tariffByCode = new Map(tariffs.map((tariff) => [tariff.icd9cmCode, tariff]));
    for (const [code, grouped] of quantityByCode) {
      const tariff = tariffByCode.get(code);
      if (!tariff) {
        gaps.push({
          reason: 'NO_TARIFF_FOR_PROCEDURE',
          code,
          description: grouped.display,
        });
        continue;
      }
      items.push(this.buildTariffItem(tariff, 'PROCEDURE', grouped.quantity));
    }
    return { items, gaps };
  }

  /**
   * Dispensed quantities are billed per medication at its catalog price. An
   * unpriced medication is a gap to surface, not a free line — pricing it
   * later means voiding and regenerating, which is the correction path anyway.
   */
  private collectMedicationItems(dispensedItems: BillingDispensedItemRecord[]): CollectedItems {
    const items: CreateInvoiceItemPayload[] = [];
    const gaps: InvoiceGenerationGap[] = [];
    const grouped = new Map<string, BillingDispensedItemRecord>();
    for (const dispensed of dispensedItems) {
      const existing = grouped.get(dispensed.medicationId);
      grouped.set(dispensed.medicationId, {
        ...dispensed,
        quantity: (existing?.quantity ?? 0) + dispensed.quantity,
      });
    }
    for (const dispensed of grouped.values()) {
      if (dispensed.medication.unitPrice === null) {
        gaps.push({
          reason: 'UNPRICED_MEDICATION',
          description: dispensed.medication.name,
        });
        continue;
      }
      items.push({
        itemType: 'MEDICATION',
        medicationId: dispensed.medicationId,
        description: dispensed.medication.name,
        quantity: dispensed.quantity,
        unitPrice: dispensed.medication.unitPrice,
        amount: toRupiah(dispensed.quantity * toCents(dispensed.medication.unitPrice)),
      });
    }
    return { items, gaps };
  }

  private buildTariffItem(
    tariff: ServiceTariffRecord,
    itemType: 'CONSULTATION' | 'PROCEDURE',
    quantity = 1,
  ): CreateInvoiceItemPayload {
    return {
      itemType,
      serviceTariffId: tariff.id,
      description: tariff.name,
      quantity,
      unitPrice: tariff.price,
      amount: toRupiah(quantity * toCents(tariff.price)),
    };
  }

  private async findConsultationTariffOrThrow(id: string): Promise<ServiceTariffRecord> {
    const tariff = await this.serviceTariffRepository.findServiceTariffById(id);

    if (!tariff || !tariff.isActive || tariff.category !== 'CONSULTATION') {
      throw new BadRequestException('consultationTariffId must name an active CONSULTATION tariff');
    }

    return tariff;
  }

  private async findBillableEncounterOrThrow(
    encounterId: string,
  ): Promise<BillingSourceEncounterRecord> {
    const encounter = await this.billingRepository.findEncounterForBilling(encounterId);

    if (!encounter) {
      throw new BadRequestException('Encounter not found');
    }

    if (encounter.status !== 'FINISHED') {
      throw new ConflictException(
        `Encounter in status ${encounter.status} can not be billed — only FINISHED visits are`,
      );
    }

    return encounter;
  }

  private async assertNoLiveInvoice(encounterId: string): Promise<void> {
    const existing = await this.billingRepository.findLiveInvoiceByEncounterId(encounterId);

    if (existing) {
      throw new ConflictException(
        'Encounter already has a live invoice; void it before generating a replacement',
      );
    }
  }

  private assertAllowedStatusTransition(
    fromStatus: InvoiceStatusValue,
    toStatus: InvoiceStatusValue,
  ): void {
    if (!canTransitionInvoiceStatus(fromStatus, toStatus)) {
      throw new ConflictException(
        `Invoice status can not change from ${fromStatus} to ${toStatus}`,
      );
    }
  }

  private async findInvoiceOrThrow(id: string) {
    const invoice = await this.billingRepository.findInvoiceWithRelationsById(id);

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  private resolveClinicToday(): Date {
    return parseBillingDateOnly(getCalendarDateInTimeZone(new Date(), this.clinicTimeZone));
  }
}
