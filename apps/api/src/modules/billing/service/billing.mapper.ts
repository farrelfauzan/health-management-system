import {
  InvoiceDetail,
  InvoiceDetailRecord,
  InvoiceItemRecord,
  InvoiceItemResponse,
  InvoiceListItem,
  InvoiceWithRelationsRecord,
  PaymentRecord,
  PaymentResponse,
  ServiceTariffRecord,
  ServiceTariffResponse,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

/** Converts persistence records into API contracts: ISO date strings, absent-over-null. */
@Injectable()
export class BillingMapper {
  toServiceTariffResponse(record: ServiceTariffRecord): ServiceTariffResponse {
    return {
      id: record.id,
      code: record.code,
      name: record.name,
      category: record.category,
      icd9cmCode: record.icd9cmCode ?? undefined,
      price: record.price,
      isActive: record.isActive,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  toInvoiceListItem(record: InvoiceWithRelationsRecord): InvoiceListItem {
    return {
      id: record.id,
      invoiceNumber: record.invoiceNumber,
      encounterId: record.encounterId,
      patientId: record.patientId,
      patient: {
        id: record.patient.id,
        mrn: record.patient.mrn,
        fullName: record.patient.fullName,
      },
      status: record.status,
      totalAmount: record.totalAmount,
      itemCount: record._count.items,
      issuedAt: record.issuedAt?.toISOString(),
      voidedAt: record.voidedAt?.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  toInvoiceDetail(record: InvoiceDetailRecord): InvoiceDetail {
    return {
      id: record.id,
      invoiceNumber: record.invoiceNumber,
      encounterId: record.encounterId,
      patientId: record.patientId,
      patient: {
        id: record.patient.id,
        mrn: record.patient.mrn,
        fullName: record.patient.fullName,
      },
      status: record.status,
      totalAmount: record.totalAmount,
      issuedAt: record.issuedAt?.toISOString(),
      voidedAt: record.voidedAt?.toISOString(),
      voidReason: record.voidReason ?? undefined,
      voidedById: record.voidedById ?? undefined,
      createdById: record.createdById ?? undefined,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      items: record.items.map((item) => this.toInvoiceItemResponse(item)),
      payment: record.payment ? this.toPaymentResponse(record.payment) : undefined,
    };
  }

  toInvoiceItemResponse(record: InvoiceItemRecord): InvoiceItemResponse {
    return {
      id: record.id,
      itemType: record.itemType,
      serviceTariffId: record.serviceTariffId ?? undefined,
      medicationId: record.medicationId ?? undefined,
      description: record.description,
      quantity: record.quantity,
      unitPrice: record.unitPrice,
      amount: record.amount,
    };
  }

  toPaymentResponse(record: PaymentRecord): PaymentResponse {
    return {
      id: record.id,
      invoiceId: record.invoiceId,
      method: record.method,
      amount: record.amount,
      referenceNumber: record.referenceNumber ?? undefined,
      notes: record.notes ?? undefined,
      paidAt: record.paidAt.toISOString(),
      cashierId: record.cashierId,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
