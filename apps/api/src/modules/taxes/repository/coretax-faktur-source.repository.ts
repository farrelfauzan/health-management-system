import { CoretaxFakturSourceInvoice, CoretaxFakturSourceLine } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const NO_TAX_CODE_FIELDS: Pick<
  CoretaxFakturSourceLine,
  'coretaxItemCode' | 'coretaxUnitCode' | 'coretaxAdditionalInfo' | 'coretaxFacilityStamp'
> = {
  coretaxItemCode: null,
  coretaxUnitCode: null,
  coretaxAdditionalInfo: null,
  coretaxFacilityStamp: null,
};

/**
 * What the Coretax Faktur Keluaran export reads (P27-T09): the invoices a
 * finalized PPN draft lists, with their issue-time tax snapshot, the patient
 * as buyer and each line's Coretax codes — the tariff's or medication's own,
 * else those of the tax code the line was taxed under (matched by the code
 * the snapshot froze). Read-only reporting over billing's tables, as the
 * report repository is. Decrypts the patient's NIK; the caller audits it.
 */
@Injectable()
export class CoretaxFakturSourceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifierCrypto: NationalIdentifierCryptoService,
  ) {}

  async findInvoices(invoiceIds: readonly string[]): Promise<CoretaxFakturSourceInvoice[]> {
    if (invoiceIds.length === 0) {
      return [];
    }
    const [invoices, taxCodes] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { id: { in: [...invoiceIds] } },
        select: {
          id: true,
          invoiceNumber: true,
          issuedAt: true,
          createdAt: true,
          patient: { select: { fullName: true, address: true, nikCiphertext: true } },
          items: {
            orderBy: { createdAt: 'asc' },
            select: {
              itemType: true,
              description: true,
              quantity: true,
              taxCode: true,
              fakturTransactionCode: true,
              taxableAmount: true,
              taxBase: true,
              taxRatePercent: true,
              taxAmount: true,
              serviceTariff: { select: { coretaxItemCode: true, coretaxUnitCode: true } },
              medication: { select: { coretaxItemCode: true, coretaxUnitCode: true } },
            },
          },
        },
        orderBy: [{ issuedAt: 'asc' }, { invoiceNumber: 'asc' }],
      }),
      this.prisma.taxCode.findMany({
        select: {
          code: true,
          coretaxItemCode: true,
          coretaxUnitCode: true,
          coretaxAdditionalInfo: true,
          coretaxFacilityStamp: true,
        },
      }),
    ]);
    const taxCodeFields = new Map(taxCodes.map(({ code, ...fields }) => [code, fields]));
    return invoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt ?? invoice.createdAt,
      buyerName: invoice.patient.fullName,
      buyerAddress: invoice.patient.address,
      buyerNik:
        invoice.patient.nikCiphertext === null
          ? null
          : this.identifierCrypto.decryptIdentifier(invoice.patient.nikCiphertext),
      lines: invoice.items.map((item) => {
        const own: Pick<CoretaxFakturSourceLine, 'coretaxItemCode' | 'coretaxUnitCode'> =
          item.serviceTariff ?? item.medication ?? { coretaxItemCode: null, coretaxUnitCode: null };
        const fromTaxCode =
          (item.taxCode === null ? undefined : taxCodeFields.get(item.taxCode)) ??
          NO_TAX_CODE_FIELDS;
        return {
          itemType: item.itemType,
          description: item.description,
          quantity: item.quantity,
          fakturTransactionCode: item.fakturTransactionCode,
          taxableAmount: item.taxableAmount === null ? null : Number(item.taxableAmount),
          taxBase: item.taxBase === null ? null : Number(item.taxBase),
          taxRatePercent: item.taxRatePercent === null ? null : Number(item.taxRatePercent),
          taxAmount: Number(item.taxAmount),
          coretaxItemCode: own.coretaxItemCode ?? fromTaxCode.coretaxItemCode,
          coretaxUnitCode: own.coretaxUnitCode ?? fromTaxCode.coretaxUnitCode,
          coretaxAdditionalInfo: fromTaxCode.coretaxAdditionalInfo,
          coretaxFacilityStamp: fromTaxCode.coretaxFacilityStamp,
        };
      }),
    }));
  }
}
