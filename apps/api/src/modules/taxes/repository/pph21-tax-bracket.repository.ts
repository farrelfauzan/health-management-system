import { Pph21TaxBracketRecord } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * The Pasal 17(1)(a) bracket table (P27-T07, D-038: tax is data). Read-only
 * here: the rows are seeded, and a new law is a new set of rows added by
 * seed or by hand, never an edit of an old one — a finalized draft names the
 * set it was taxed under and must reproduce years later.
 */
@Injectable()
export class Pph21TaxBracketRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listBrackets(): Promise<Pph21TaxBracketRecord[]> {
    const rows = await this.prisma.pph21TaxBracket.findMany({
      orderBy: [{ effectiveFrom: 'asc' }, { lowerBound: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      lowerBound: Number(row.lowerBound),
      upperBound: row.upperBound === null ? null : Number(row.upperBound),
      ratePercent: Number(row.ratePercent),
    }));
  }
}
