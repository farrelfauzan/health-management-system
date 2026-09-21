import { ClinicalRequestRenderContext, DocumentCategoryValue } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { CLINICAL_REQUEST_AUDIT_ACTION_BY_KIND } from '../service/clinical-request-audit-actions';

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

/**
 * Which patient-file category each rendered kind is filed under. A map rather
 * than the old hard-coded `REFERRAL_LETTER`, which was already loose for a
 * resep and would be wrong for a surat keterangan hamil.
 */
const DOCUMENT_CATEGORY_BY_KIND: Readonly<
  Record<ClinicalRequestRenderContext['kind'], DocumentCategoryValue>
> = {
  LAB_REQUEST: 'REFERRAL_LETTER',
  PRESCRIPTION: 'REFERRAL_LETTER',
  REFERRAL_LETTER: 'REFERRAL_LETTER',
  PREGNANCY_CERTIFICATE: 'PREGNANCY_CERTIFICATE',
  BIRTH_CERTIFICATE: 'BIRTH_CERTIFICATE',
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
          category: DOCUMENT_CATEGORY_BY_KIND[context.kind],
          documentDate: new Date(),
        },
        select: { id: true },
      });
      // Only the two request kinds point back at the record they were
      // rendered from: a lab order has one current letter and a prescription
      // one current resep. A maternal letter has no such column, and is not
      // meant to — see `findExistingIdInTransaction`.
      if (context.kind === 'LAB_REQUEST') {
        await tx.labOrder.update({
          where: { id: context.subjectId },
          data: { requestDocumentId: created.id },
        });
      } else if (context.kind === 'PRESCRIPTION') {
        await tx.prescription.update({
          where: { id: context.subjectId },
          data: { documentId: created.id },
        });
      }
      return { id: created.id, printCount: await this.countPrints(tx, context) };
    });
  }

  /**
   * The document this request already has, when it has one.
   *
   * The two maternal letters (P25-T07) deliberately have none: "terbitkan
   * ulang" is a **new** document rendered from current data and the old one is
   * kept, because a surat rujukan the patient already carried to a hospital is
   * a record of what was said that day. A resep is the opposite — one current
   * copy, reprinted — which is why the two behave differently here rather than
   * in the caller.
   */
  private async findExistingIdInTransaction(
    tx: Parameters<Parameters<PrismaService['executeTransaction']>[0]>[0],
    context: ClinicalRequestRenderContext,
  ): Promise<string | null> {
    // These three are reissued, never reprinted: each render is a new copy
    // the family takes away, and the record keeps every one.
    if (
      context.kind === 'REFERRAL_LETTER' ||
      context.kind === 'PREGNANCY_CERTIFICATE' ||
      context.kind === 'BIRTH_CERTIFICATE'
    ) {
      return null;
    }
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
        action: CLINICAL_REQUEST_AUDIT_ACTION_BY_KIND[context.kind],
        resourceId: context.subjectId,
      },
    });
    // The audit row for this print is written after the transaction commits, so
    // the count here is the prints before it.
    return previous + 1;
  }
}
