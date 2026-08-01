import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

export type MappedSpecialtyRow = {
  readonly id: string;
  readonly name: string;
  readonly bpjsPoliCode: string | null;
};

export type MappedDoctorRow = {
  readonly id: string;
  readonly fullName: string;
  readonly bpjsDoctorCode: string | null;
  readonly openSessionCount: number;
};

/**
 * Read-only projections for the HFIS reconciliation report (P14-T05).
 *
 * A repository inside the antrean module rather than calls into the
 * specialty, doctor and appointment services, for one structural reason: the
 * PCare module already depends on this one (it delegates the `ANTREAN_*`
 * outbox types), so reaching back through `BpjsMappingService` would close a
 * module cycle. The precedent is `findMonthlyReconciliation` on the PCare
 * submission repository — a reporting query that spans several domains and
 * writes nothing.
 *
 * **Nothing here writes.** That is the whole contract of §4.3: HMS cannot
 * write HFIS, and it does not get to "fix" its own side automatically either
 * — the clinic decides which system was wrong.
 */
@Injectable()
export class BpjsAntreanReconciliationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async listSpecialties(): Promise<MappedSpecialtyRow[]> {
    const rows = await this.prismaService.findManyActive(this.prismaService.specialty, {
      select: { id: true, name: true, bpjsPoliCode: true },
      orderBy: { name: 'asc' },
    });
    return rows;
  }

  /**
   * Active doctors with a count of their **open** sessions inside the
   * reconciliation window. Cancelled and closed sessions are excluded because
   * a member cannot be served by them, which is the only question the report
   * is asking.
   */
  async listDoctorsWithOpenSessions(params: {
    fromDate: Date;
    toDate: Date;
  }): Promise<MappedDoctorRow[]> {
    const rows = await this.prismaService.findManyActive(this.prismaService.doctorProfile, {
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        bpjsDoctorCode: true,
        _count: {
          select: {
            appointmentSessions: {
              where: {
                status: 'OPEN',
                sessionDate: { gte: params.fromDate, lte: params.toDate },
              },
            },
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      bpjsDoctorCode: row.bpjsDoctorCode,
      openSessionCount: row._count.appointmentSessions,
    }));
  }
}
