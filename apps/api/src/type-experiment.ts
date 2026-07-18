import { Prisma, PrismaClient } from './generated/prisma/client';

declare const prisma: PrismaClient;

declare function probeHelper<
  TDelegate extends { findFirst(args?: unknown): Promise<unknown> },
  const TArgs extends Prisma.Args<TDelegate, 'findFirst'>,
>(model: TDelegate, args: TArgs): Promise<Prisma.Result<TDelegate, TArgs, 'findFirst'>>;

const scheduleOrderBy: Prisma.DoctorScheduleOrderByWithRelationInput[] = [
  { dayOfWeek: 'asc' },
  { startTime: 'asc' },
];

export async function probeTypedArrayOrderBy(): Promise<void> {
  const doctorDetail = await probeHelper(prisma.doctorProfile, {
    where: { id: 'x' },
    include: {
      schedules: { orderBy: scheduleOrderBy },
      _count: { select: { patients: { where: { unassignedAt: null } } } },
    },
  });
  if (doctorDetail) {
    console.log(doctorDetail.schedules, doctorDetail._count.patients);
  }
}
