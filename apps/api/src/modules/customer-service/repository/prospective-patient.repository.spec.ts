import { PrismaService } from '../../../common/prisma/prisma.service';
import { ProspectivePatientRepository } from './prospective-patient.repository';

describe('ProspectivePatientRepository', () => {
  const prospectivePatientId = '1f0c1b2a-1111-4222-8333-aa6a1de1b001';
  const patientId = '2f0c1b2a-2222-4333-8444-aa6a1de1b002';
  const frontDeskUserId = '3f0c1b2a-3333-4444-8555-aa6a1de1b003';

  function buildRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: prospectivePatientId,
      fullName: 'Siti Rahayu',
      phoneNumber: '628121000001',
      channel: 'WHATSAPP',
      externalChatId: 'wa:628121000001',
      status: 'AWAITING_ARRIVAL',
      patientId: null,
      convertedAt: null,
      convertedById: null,
      expiresAt: new Date('2026-11-29T00:00:00.000Z'),
      createdAt: new Date('2026-08-31T02:00:00.000Z'),
      ...overrides,
    };
  }

  it('opens a record without allocating an MRN or touching a patient profile', async () => {
    const inputParams = {
      fullName: 'Siti Rahayu',
      phoneNumber: '628121000001',
      channel: 'WHATSAPP' as const,
      externalChatId: 'wa:628121000001',
      expiresAt: new Date('2026-11-29T00:00:00.000Z'),
    };
    const mockCreate = jest.fn().mockResolvedValue(buildRow());
    const mockPrisma = {
      prospectivePatient: { create: mockCreate },
      patientProfile: {},
      mrnCounter: {},
    } as unknown as PrismaService;
    const repository = new ProspectivePatientRepository(mockPrisma);

    const actualRecord = await repository.createAwaitingArrival(inputParams);

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        fullName: 'Siti Rahayu',
        phoneNumber: '628121000001',
        channel: 'WHATSAPP',
        externalChatId: 'wa:628121000001',
        expiresAt: new Date('2026-11-29T00:00:00.000Z'),
      },
    });
    expect(actualRecord.status).toBe('AWAITING_ARRIVAL');
    expect(actualRecord.patientId).toBeNull();
    expect(actualRecord.expiresAt).toBe('2026-11-29T00:00:00.000Z');
  });

  it('keeps two bookings from one number apart instead of collapsing them', async () => {
    const mockFindMany = jest
      .fn()
      .mockResolvedValue([
        buildRow({ id: prospectivePatientId, fullName: 'Siti Rahayu' }),
        buildRow({ id: '4f0c1b2a-4444-4555-8666-aa6a1de1b004', fullName: 'Adi Rahayu' }),
      ]);
    const mockPrisma = {
      prospectivePatient: { findMany: mockFindMany },
    } as unknown as PrismaService;
    const repository = new ProspectivePatientRepository(mockPrisma);

    const actualRecords = await repository.findAwaitingArrivalByPhoneNumber('628121000001');

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { phoneNumber: '628121000001', status: 'AWAITING_ARRIVAL' },
      orderBy: { createdAt: 'desc' },
    });
    expect(actualRecords.map((record) => record.fullName)).toEqual(['Siti Rahayu', 'Adi Rahayu']);
  });

  it('marks a match to an existing patient as LINKED rather than CONVERTED', async () => {
    const convertedAt = new Date('2026-09-01T03:15:00.000Z');
    const mockUpdate = jest.fn().mockResolvedValue(
      buildRow({
        status: 'LINKED',
        patientId,
        convertedById: frontDeskUserId,
        convertedAt,
      }),
    );
    const mockPrisma = {
      prospectivePatient: { update: mockUpdate },
    } as unknown as PrismaService;
    const repository = new ProspectivePatientRepository(mockPrisma);

    const actualRecord = await repository.markLinked({
      prospectivePatientId,
      patientId,
      convertedById: frontDeskUserId,
      convertedAt,
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: prospectivePatientId },
      data: {
        status: 'LINKED',
        patientId,
        convertedById: frontDeskUserId,
        convertedAt,
      },
    });
    expect(actualRecord.status).toBe('LINKED');
    expect(actualRecord.convertedAt).toBe('2026-09-01T03:15:00.000Z');
  });

  it('marks a new registration as CONVERTED', async () => {
    const convertedAt = new Date('2026-09-01T03:20:00.000Z');
    const mockUpdate = jest
      .fn()
      .mockResolvedValue(buildRow({ status: 'CONVERTED', patientId, convertedAt }));
    const mockPrisma = {
      prospectivePatient: { update: mockUpdate },
    } as unknown as PrismaService;
    const repository = new ProspectivePatientRepository(mockPrisma);

    const actualRecord = await repository.markConverted({
      prospectivePatientId,
      patientId,
      convertedById: frontDeskUserId,
      convertedAt,
    });

    expect(mockUpdate.mock.calls[0]?.[0]).toMatchObject({ data: { status: 'CONVERTED' } });
    expect(actualRecord.status).toBe('CONVERTED');
  });

  it('expires only unresolved records, so a resolved one is never swept', async () => {
    const inputNow = new Date('2026-11-30T00:00:00.000Z');
    const mockUpdateMany = jest.fn().mockResolvedValue({ count: 3 });
    const mockPrisma = {
      prospectivePatient: { updateMany: mockUpdateMany },
    } as unknown as PrismaService;
    const repository = new ProspectivePatientRepository(mockPrisma);

    const actualCount = await repository.expireOverdue(inputNow);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { status: 'AWAITING_ARRIVAL', expiresAt: { lte: inputNow } },
      data: { status: 'EXPIRED' },
    });
    expect(actualCount).toBe(3);
  });
});
