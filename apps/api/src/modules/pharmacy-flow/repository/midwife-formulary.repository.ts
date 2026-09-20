import {
  DoctorAuthorityKindValue,
  MidwifeFormularyCandidateRecord,
  MidwifeFormularyItemRecord,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

const CANDIDATE_SELECT = {
  id: true,
  name: true,
  kfaCode: true,
  isMidwifePrescribable: true,
} satisfies Prisma.MedicationSelect;

/**
 * Persistence for the midwife formulary template (P25-T04). Separate from
 * {@link PharmacyFlowRepository} because it reads a reference table the
 * catalog never writes and performs the one catalog write the template is
 * allowed: setting `isMidwifePrescribable` on rows the clinic confirmed, and
 * never clearing it.
 */
@Injectable()
export class MidwifeFormularyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listItems(): Promise<MidwifeFormularyItemRecord[]> {
    return this.prisma.midwifeFormularyItem.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  /** Every catalog row that is not soft-deleted; vaccines included (HB0 is one). */
  async listCandidateMedications(): Promise<MidwifeFormularyCandidateRecord[]> {
    return this.prisma.medication.findMany({
      where: { deletedAt: null },
      select: CANDIDATE_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Flags the given rows in one statement and answers how many changed. The
   * predicate excludes rows already flagged and rows deleted since the
   * preview, so the count is exactly the newly flagged set.
   */
  async flagMidwifePrescribable(medicationIds: string[]): Promise<number> {
    const result = await this.prisma.medication.updateMany({
      where: { id: { in: medicationIds }, deletedAt: null, isMidwifePrescribable: false },
      data: { isMidwifePrescribable: true },
    });
    return result.count;
  }

  /**
   * Binds rows matched by an `AUTHORITY_BOUND` template item to the authority
   * that item names (P25-T05). Written separately from the flag because the
   * two answer different questions and a row can already be flagged while
   * still needing the binding — an existing kind is never overwritten, for
   * the same reason the flag is never cleared: the clinic's own edit wins.
   */
  async bindMidwifeAuthorityKind(
    medicationIds: string[],
    authorityKind: DoctorAuthorityKindValue,
  ): Promise<number> {
    const result = await this.prisma.medication.updateMany({
      where: { id: { in: medicationIds }, deletedAt: null, midwifeAuthorityKind: null },
      data: { midwifeAuthorityKind: authorityKind },
    });
    return result.count;
  }
}
