import {
  SaveFailedTaxReportDocumentPayload,
  SaveReadyTaxReportDocumentPayload,
  TaxReportDocumentRecord,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma, TaxReportDocument } from '../../../generated/prisma/client';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/**
 * The stored PDF of a finalized tax report (P27-T12), one row per report.
 *
 * Both writes are conditional on the row not being READY, so a READY row is
 * never rewritten: a render that loses a race to a concurrent one learns so
 * from the `false` it gets back and discards its own bytes, and every later
 * download serves the file the winner stored.
 */
@Injectable()
export class TaxReportDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDocumentByReportId(reportId: string): Promise<TaxReportDocumentRecord | null> {
    const row = await this.prisma.taxReportDocument.findUnique({ where: { reportId } });
    return row ? this.toRecord(row) : null;
  }

  /** Stores the rendered file. `false` when another render stored one first. */
  async saveReadyDocument(payload: SaveReadyTaxReportDocumentPayload): Promise<boolean> {
    const data = {
      status: 'READY' as const,
      storageKey: payload.storageKey,
      checksum: payload.checksum,
      sizeBytes: payload.sizeBytes,
      failureReason: null,
      renderedAt: payload.renderedAt,
    };
    if (await this.createDocument({ reportId: payload.reportId, ...data })) {
      return true;
    }
    const updated = await this.prisma.taxReportDocument.updateMany({
      where: { reportId: payload.reportId, status: 'FAILED' },
      data,
    });
    return updated.count > 0;
  }

  /** Records why a render failed, unless a concurrent render already succeeded. */
  async saveFailedDocument(payload: SaveFailedTaxReportDocumentPayload): Promise<void> {
    const data = { status: 'FAILED' as const, failureReason: payload.failureReason };
    if (await this.createDocument({ reportId: payload.reportId, ...data })) {
      return;
    }
    await this.prisma.taxReportDocument.updateMany({
      where: { reportId: payload.reportId, status: 'FAILED' },
      data,
    });
  }

  /** `false` when the report already has a row. */
  private async createDocument(
    data: Prisma.TaxReportDocumentUncheckedCreateInput,
  ): Promise<boolean> {
    try {
      await this.prisma.taxReportDocument.create({ data });
      return true;
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_CONSTRAINT_ERROR_CODE
      ) {
        return false;
      }
      throw err;
    }
  }

  private toRecord(row: TaxReportDocument): TaxReportDocumentRecord {
    return {
      id: row.id,
      reportId: row.reportId,
      status: row.status,
      storageKey: row.storageKey,
      checksum: row.checksum,
      sizeBytes: row.sizeBytes,
      failureReason: row.failureReason,
      renderedAt: row.renderedAt,
    };
  }
}
