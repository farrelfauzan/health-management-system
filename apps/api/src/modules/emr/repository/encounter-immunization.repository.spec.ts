import { PrismaService } from '../../../common/prisma/prisma.service';
import { EncounterRepository } from './encounter.repository';

const DOCTOR_PROFILE_ID = '11111111-1111-4111-8111-111111111111';

type PerformedByRow = { fullName: string; ownerUser?: { fullName: string | null } | null } | null;

function buildImmunizationRow(performedBy: PerformedByRow): Record<string, unknown> {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    encounterId: '33333333-3333-4333-8333-333333333333',
    patientId: '44444444-4444-4444-8444-444444444444',
    medicationId: '55555555-5555-4555-8555-555555555555',
    occurredAt: new Date('2026-09-21T08:00:00.000Z'),
    lotNumber: 'LOT-1',
    expirationDate: null,
    doseNumber: 1,
    route: 'IM',
    site: 'LEFT_THIGH',
    performedById: performedBy ? DOCTOR_PROFILE_ID : null,
    notes: null,
    isHistorical: false,
    reason: 'IM_DASAR',
    createdAt: new Date('2026-09-21T08:00:00.000Z'),
    updatedAt: new Date('2026-09-21T08:00:00.000Z'),
    medication: { name: 'Vaksin BCG', kfaCode: '93001234' },
    performedBy,
  };
}

function buildRepository(row: Record<string, unknown>): EncounterRepository {
  const prisma = {
    immunization: { findFirst: jest.fn().mockResolvedValue(row) },
  } as unknown as PrismaService;
  return new EncounterRepository(prisma);
}

/**
 * P20-T07: the immunization performer is recorded by doctor profile, and is
 * named the way D-027 names a person — the owning account first, the profile's
 * own name while the account has none.
 */
describe('EncounterRepository immunization performer name', () => {
  it("names the performer by their account's name", async () => {
    const repository = buildRepository(
      buildImmunizationRow({
        fullName: 'Bd. Rina',
        ownerUser: { fullName: 'Bd. Rina Kartika, S.Tr.Keb' },
      }),
    );

    const actual = await repository.findImmunizationById('22222222-2222-4222-8222-222222222222');

    expect(actual?.performedById).toBe(DOCTOR_PROFILE_ID);
    expect(actual?.performedByName).toBe('Bd. Rina Kartika, S.Tr.Keb');
  });

  it('falls back to the profile name when the account has none', async () => {
    const repository = buildRepository(
      buildImmunizationRow({ fullName: 'Bd. Rina Kartika', ownerUser: { fullName: null } }),
    );

    const actual = await repository.findImmunizationById('22222222-2222-4222-8222-222222222222');

    expect(actual?.performedByName).toBe('Bd. Rina Kartika');
  });

  it('has no performer name when no performer was recorded', async () => {
    const repository = buildRepository(buildImmunizationRow(null));

    const actual = await repository.findImmunizationById('22222222-2222-4222-8222-222222222222');

    expect(actual?.performedById).toBeNull();
    expect(actual?.performedByName).toBeNull();
  });
});
