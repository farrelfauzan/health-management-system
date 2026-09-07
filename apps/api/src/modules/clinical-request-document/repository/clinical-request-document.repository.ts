import { ClinicalRequestRenderContext } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

type FileClinicalRequestDocumentPayload = {
  context: ClinicalRequestRenderContext;
  storageKey: string;
  sizeBytes: number;
  uploadedById: string;
};

type FiledClinicalRequestDocument = {
  id: string;
  printCount: number;
};

const PDF_MIME_TYPE = 'application/pdf';

/**
 * Persistence for a printed clinical request (`P18-T12`).
 *
 * The letter is an ordinary patient clinical file — `PATIENT_CLINICAL`,
 * category `REFERRAL_LETTER` — so it appears in the patient's document list
 * beside everything else filed on the visit and downloads through the same
 * signed-URL route. There is no second document store, and the letter is not a
 * `ManagedDocument`: that registry is for things somebody drafts and approves,
 * and a letter rendered from an order is neither.
 */
@Injectable()
export class ClinicalRequestDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findExistingDocumentId(
    kind: ClinicalRequestRenderContext['kind'],
    subjectId: string,
  ): Promise<string | null> {
    if (kind === 'LAB_REQUEST') {
      const order = await this.prisma.labOrder.findUnique({
        where: { id: subjectId },
        select: { requestDocumentId: true },
      });
      return order?.requestDocumentId ?? null;
    }
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: subjectId },
      select: { documentId: true },
    });
    return prescription?.documentId ?? null;
  }

  /**
   * Files the rendered bytes and links them to the request, in one transaction.
   *
   * A reprint replaces the stored object on the *same* document row rather than
   * filing a second one: the patient's file list would otherwise fill with
   * copies of one letter, and "which of these five is current" is a question
   * nobody should have to answer. The print count on the row is what records
   * that a reprint happened.
   */
  async fileDocument(
    payload: FileClinicalRequestDocumentPayload,
  ): Promise<FiledClinicalRequestDocument> {
    const { context, storageKey, sizeBytes, uploadedById } = payload;

    return this.prisma.executeTransaction(async (tx) => {
      const existingId = await this.findExistingIdInTransaction(tx, context);
      if (existingId) {
        const updated = await tx.document.update({
          where: { id: existingId },
          data: { storageKey, sizeBytes, title: context.title },
          select: { id: true },
        });
        return { id: updated.id, printCount: await this.countPrints(tx, context) };
      }
      const created = await tx.document.create({
        data: {
          ownerType: 'PATIENT',
          purpose: 'PATIENT_CLINICAL',
          title: context.title,
          storageKey,
          mimeType: PDF_MIME_TYPE,
          sizeBytes,
          uploadedById,
          patientId: context.patientId,
          encounterId: context.encounterId,
          category: 'REFERRAL_LETTER',
          documentDate: new Date(),
        },
        select: { id: true },
      });
      if (context.kind === 'LAB_REQUEST') {
        await tx.labOrder.update({
          where: { id: context.subjectId },
          data: { requestDocumentId: created.id },
        });
      } else {
        await tx.prescription.update({
          where: { id: context.subjectId },
          data: { documentId: created.id },
        });
      }
      return { id: created.id, printCount: await this.countPrints(tx, context) };
    });
  }

  private async findExistingIdInTransaction(
    tx: Parameters<Parameters<PrismaService['executeTransaction']>[0]>[0],
    context: ClinicalRequestRenderContext,
  ): Promise<string | null> {
    if (context.kind === 'LAB_REQUEST') {
      const order = await tx.labOrder.findUnique({
        where: { id: context.subjectId },
        select: { requestDocumentId: true },
      });
      return order?.requestDocumentId ?? null;
    }
    const prescription = await tx.prescription.findUnique({
      where: { id: context.subjectId },
      select: { documentId: true },
    });
    return prescription?.documentId ?? null;
  }

  /**
   * How many times this request has been printed, read from the audit log
   * rather than a counter column. The log is already the record of every print
   * — a second counter would be a number that can disagree with it.
   */
  private async countPrints(
    tx: Parameters<Parameters<PrismaService['executeTransaction']>[0]>[0],
    context: ClinicalRequestRenderContext,
  ): Promise<number> {
    const previous = await tx.auditLog.count({
      where: {
        action: context.kind === 'LAB_REQUEST' ? 'LAB_REQUEST_PRINTED' : 'PRESCRIPTION_PRINTED',
        resourceId: context.subjectId,
      },
    });
    // The audit row for this print is written after the transaction commits, so
    // the count here is the prints before it.
    return previous + 1;
  }
}
