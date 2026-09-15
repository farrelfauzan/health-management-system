import { PrismaService } from '../../../common/prisma/prisma.service';
import { DoctorAuthorityConflictError } from './doctor-authority-conflict.error';
import { DoctorAuthorityRepository } from './doctor-authority.repository';

/**
 * The predicates behind `hasActiveAuthority` and the expiry sweep (P25-T02,
 * D-036), asserted on the query the repository sends. Every grant has an end
 * date, so neither predicate carries an open-ended branch.
 */
describe('DoctorAuthorityRepository', () => {
  const prismaMock = {
    doctorAuthority: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    doctorAuthorityExpiryNotice: {
      createMany: jest.fn(),
    },
  };
  let repository: DoctorAuthorityRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new DoctorAuthorityRepository(prismaMock as unknown as PrismaService);
  });

  describe('hasActiveAuthority', () => {
    it('asks for a live row whose period covers the date with both ends inclusive', async () => {
      const inputOnDate = new Date('2027-12-31T00:00:00.000Z');
      prismaMock.doctorAuthority.count.mockResolvedValue(1);

      const actual = await repository.hasActiveAuthority('doctor-1', 'MTBS', inputOnDate);

      expect(actual).toBe(true);
      expect(prismaMock.doctorAuthority.count).toHaveBeenCalledWith({
        where: {
          doctorId: 'doctor-1',
          kind: 'MTBS',
          revokedAt: null,
          deletedAt: null,
          validFrom: { lte: inputOnDate },
          validUntil: { gte: inputOnDate },
        },
      });
    });

    it('answers false when no live row covers the date', async () => {
      prismaMock.doctorAuthority.count.mockResolvedValue(0);

      const actual = await repository.hasActiveAuthority(
        'doctor-1',
        'MTBS',
        new Date('2028-01-01T00:00:00.000Z'),
      );

      expect(actual).toBe(false);
    });
  });

  describe('listExpiringAuthorities', () => {
    it('sweeps every unrevoked, undeleted grant ending by the date, for active clinicians', async () => {
      const inputThrough = new Date('2027-12-31T00:00:00.000Z');
      prismaMock.doctorAuthority.findMany.mockResolvedValue([
        {
          id: 'authority-1',
          doctorId: 'doctor-1',
          kind: 'IUD_IMPLANT',
          grantKind: 'DINAS_PENETAPAN',
          grantReference: 'PENETAPAN-0001',
          validUntil: inputThrough,
          doctor: { fullName: 'Bd. Siti Aminah' },
        },
      ]);

      const actual = await repository.listExpiringAuthorities(inputThrough);

      expect(prismaMock.doctorAuthority.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            revokedAt: null,
            validUntil: { lte: inputThrough },
            doctor: { deletedAt: null, isActive: true },
          },
        }),
      );
      expect(actual).toEqual([
        {
          authorityId: 'authority-1',
          doctorId: 'doctor-1',
          doctorName: 'Bd. Siti Aminah',
          kind: 'IUD_IMPLANT',
          grantKind: 'DINAS_PENETAPAN',
          grantReference: 'PENETAPAN-0001',
          validUntil: inputThrough,
        },
      ]);
    });
  });

  describe('create', () => {
    it('maps a unique violation to DoctorAuthorityConflictError', async () => {
      prismaMock.doctorAuthority.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        repository.create({
          doctorId: 'doctor-1',
          kind: 'MTBS',
          grantKind: 'STR_ANNOTATION',
          grantReference: 'STR-0001',
          grantIssuedAt: new Date('2025-12-15T00:00:00.000Z'),
          trainingCertificateNumber: 'CTU-0042',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validUntil: new Date('2027-12-31T00:00:00.000Z'),
          grantDocument: null,
          createdById: 'admin-user',
        }),
      ).rejects.toBeInstanceOf(DoctorAuthorityConflictError);
    });
  });

  describe('claimExpiryNotice', () => {
    it('reports whether this call inserted the notice', async () => {
      prismaMock.doctorAuthorityExpiryNotice.createMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const actualFirst = await repository.claimExpiryNotice('authority-1', 60);
      const actualSecond = await repository.claimExpiryNotice('authority-1', 60);

      expect([actualFirst, actualSecond]).toEqual([true, false]);
    });
  });
});
