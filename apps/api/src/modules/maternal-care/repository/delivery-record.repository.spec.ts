import { PrismaService } from '../../../common/prisma/prisma.service';
import { DeliveryRecordRepository } from './delivery-record.repository';

/**
 * P25-T10. What recording a baby and correcting a birth do to SHK samples,
 * checked against the writes the transaction issues. The integration spec
 * proves the same against Postgres.
 */
describe('DeliveryRecordRepository SHK writes (P25-T10)', () => {
  const txMock = {
    deliveryRecord: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
    pregnancyEpisode: { update: jest.fn() },
    newbornCareRecord: { create: jest.fn(), findUniqueOrThrow: jest.fn() },
    shkScreening: { updateMany: jest.fn(), create: jest.fn() },
  };
  const prismaMock = {
    executeTransaction: async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
  };
  const repository = new DeliveryRecordRepository(prismaMock as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    txMock.deliveryRecord.findUniqueOrThrow.mockResolvedValue({
      pregnancyEpisodeId: 'episode-1',
      birthAt: new Date('2026-09-30T20:00:00.000Z'),
    });
    txMock.newbornCareRecord.create.mockResolvedValue({ id: 'newborn-1' });
  });

  it('moves only untaken first-sample windows when the birth time changes', async () => {
    await repository.updateDelivery('delivery-1', { birthAt: '2026-09-30T22:30:00.000Z' });

    expect(txMock.shkScreening.updateMany).toHaveBeenCalledWith({
      where: {
        sequence: 1,
        sampleTakenAt: null,
        newbornCareRecord: { deliveryRecordId: 'delivery-1' },
      },
      data: {
        dueFrom: new Date('2026-10-02T22:30:00.000Z'),
        dueUntil: new Date('2026-10-03T22:30:00.000Z'),
      },
    });
  });

  it('leaves the windows alone when the birth time is not corrected', async () => {
    await repository.updateDelivery('delivery-1', { bloodLossMl: 300 });

    expect(txMock.shkScreening.updateMany).not.toHaveBeenCalled();
  });

  it('writes sequence 1 with a live baby', async () => {
    await repository.createNewborn('delivery-1', { outcome: 'LIVE_BIRTH', sex: 'FEMALE' });

    expect(txMock.shkScreening.create).toHaveBeenCalledWith({
      data: {
        newbornCareRecordId: 'newborn-1',
        sequence: 1,
        dueFrom: new Date('2026-10-02T20:00:00.000Z'),
        dueUntil: new Date('2026-10-03T20:00:00.000Z'),
      },
    });
  });

  it('writes no sample with a stillborn baby', async () => {
    await repository.createNewborn('delivery-1', {
      outcome: 'STILLBIRTH',
      sex: 'MALE',
      stillbirthOrder: 1,
    });

    expect(txMock.shkScreening.create).not.toHaveBeenCalled();
  });
});
