import { PrismaService } from '../../../common/prisma/prisma.service';
import { LabDailyNumberAllocatorRepository } from './lab-daily-number-allocator.repository';
import { LabOrderRow } from './lab-order-row.types';
import { LabOrderRepository } from './lab-order.repository';

const DOCTOR_PROFILE_ID = '11111111-1111-4111-8111-111111111111';

function buildRow(orderedBy: LabOrderRow['orderedBy']): LabOrderRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    orderNumber: 'LAB/20260921/0001',
    encounterId: '33333333-3333-4333-8333-333333333333',
    registrationId: '44444444-4444-4444-8444-444444444444',
    source: 'ENCOUNTER',
    patientId: '55555555-5555-4555-8555-555555555555',
    orderedById: orderedBy ? DOCTOR_PROFILE_ID : null,
    externalRequesterName: null,
    externalRequesterFacility: null,
    status: 'ORDERED',
    priority: 'ROUTINE',
    clinicalNotes: null,
    isFasting: false,
    fulfilmentSite: 'INTERNAL',
    chargeMode: 'CLINIC',
    externalFacilityName: null,
    recollectCount: 0,
    orderedAt: new Date('2026-09-21T08:00:00.000Z'),
    cancelledAt: null,
    cancelReason: null,
    releasedAt: null,
    orderedBy,
    items: [],
    specimens: [],
  };
}

/**
 * P20-T07: the requester on a lab order is recorded by doctor profile, and is
 * named the way D-027 names a person — the owning account first.
 */
describe('LabOrderRepository requester name', () => {
  const repository = new LabOrderRepository(
    {} as PrismaService,
    {} as LabDailyNumberAllocatorRepository,
  );

  it("names the requester by their account's name when the profile has one", () => {
    const inputRow = buildRow({
      fullName: 'dr. Andi',
      ownerUser: { fullName: 'dr. Andi Wijaya, Sp.PK' },
    });

    const actual = repository.toLabOrderRecord(inputRow);

    expect(actual.orderedById).toBe(DOCTOR_PROFILE_ID);
    expect(actual.orderedByName).toBe('dr. Andi Wijaya, Sp.PK');
  });

  it('falls back to the profile name for a doctor without a named account', () => {
    const actual = repository.toLabOrderRecord(
      buildRow({ fullName: 'dr. Andi Wijaya', ownerUser: null }),
    );

    expect(actual.orderedByName).toBe('dr. Andi Wijaya');
  });

  it('has no requester name for an order nobody at the clinic placed', () => {
    const actual = repository.toLabOrderRecord(buildRow(null));

    expect(actual.orderedById).toBeNull();
    expect(actual.orderedByName).toBeNull();
  });
});
