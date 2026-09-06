import { PrismaService } from '../../../common/prisma/prisma.service';
import { PharmacyFlowRepository } from './pharmacy-flow.repository';

describe('PharmacyFlowRepository inventory', () => {
  const medicationId = '9a1f34c8-8e10-4d0e-8c31-4f6a1de1a004';
  const prescriptionId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001';
  const dispenseItemId = 'e5f6a7b8-3333-4444-8555-bf6a1de1a008';
  const prescriptionItemId = 'c1b2a3d4-1111-4222-8333-9f6a1de1a006';
  const firstReceiptId = 'a5f6a7b8-3333-4444-8555-bf6a1de1a009';
  const secondReceiptId = 'b5f6a7b8-3333-4444-8555-bf6a1de1a010';

  it('computes and filters medication stock from receipt allocations', async () => {
    const prisma = {
      medication: {},
      findManyActive: jest.fn().mockResolvedValue([
        {
          id: medicationId,
          code: 'MED-01',
          name: 'Amoxicillin',
          reorderLevel: 10,
          stockReceipts: [
            { remainingQuantity: 13, expiryDate: new Date('2028-01-31T00:00:00Z') },
          ],
        },
      ]),
    } as unknown as PrismaService;
    const repository = new PharmacyFlowRepository(prisma);

    const result = await repository.listMedications({
      page: 1,
      limit: 10,
      reorderOnly: true,
      inventoryDate: new Date('2026-07-30T00:00:00Z'),
    });

    expect(result.total).toBe(0);
    expect((prisma.findManyActive as jest.Mock).mock.calls[0]?.[1]).toMatchObject({
      include: {
        stockReceipts: {
          where: {
            remainingQuantity: { gt: 0 },
            OR: [
              { expiryDate: null },
              { expiryDate: { gte: new Date('2026-07-30T00:00:00Z') } },
            ],
          },
        },
      },
    });
  });

  it('splits a dispense across locked FEFO receipt rows in returned order', async () => {
    const finalRecord = {
      id: 'd4e5f6a7-2222-4333-8444-af6a1de1a007',
      prescriptionId,
      pharmacistId: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
      status: 'DISPENSED',
      dispensedAt: new Date(),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
      prescription: { status: 'DISPENSED' },
    };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: firstReceiptId, remainingQuantity: 4 },
          { id: secondReceiptId, remainingQuantity: 10 },
        ]),
      prescription: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'ISSUED',
          items: [
            {
              id: prescriptionItemId,
              medicationId,
              quantity: 9,
              isCompound: false,
              components: [],
            },
          ],
          dispenseRecords: [],
        }),
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      dispenseRecord: {
        create: jest.fn().mockResolvedValue({
          id: finalRecord.id,
          items: [{ id: dispenseItemId, medicationId, prescriptionItemId: null }],
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(finalRecord),
      },
      dispenseItemStockAllocation: { createMany: jest.fn() },
      medicationStockReceipt: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      executeTransaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    } as unknown as PrismaService;
    const repository = new PharmacyFlowRepository(prisma);

    await repository.createDispense({
      prescriptionId,
      pharmacistId: finalRecord.pharmacistId,
      items: [{ medicationId, quantity: 9 }],
      inventoryDate: new Date('2026-07-30T00:00:00.000Z'),
    });

    expect(tx.dispenseItemStockAllocation.createMany).toHaveBeenCalledWith({
      data: [
        { dispenseItemId, stockReceiptId: firstReceiptId, quantity: 4 },
        { dispenseItemId, stockReceiptId: secondReceiptId, quantity: 5 },
      ],
    });
    expect(tx.medicationStockReceipt.updateMany).toHaveBeenCalledTimes(2);
  });

  it('rolls the dispense back when a guarded receipt decrement loses its balance', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: firstReceiptId, remainingQuantity: 9 }]),
      prescription: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'ISSUED',
          items: [
            {
              id: prescriptionItemId,
              medicationId,
              quantity: 9,
              isCompound: false,
              components: [],
            },
          ],
          dispenseRecords: [],
        }),
        update: jest.fn(),
      },
      dispenseRecord: {
        create: jest.fn().mockResolvedValue({
          id: 'd4e5f6a7-2222-4333-8444-af6a1de1a007',
          items: [{ id: dispenseItemId, medicationId, prescriptionItemId: null }],
        }),
      },
      dispenseItemStockAllocation: { createMany: jest.fn() },
      medicationStockReceipt: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      executeTransaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    } as unknown as PrismaService;
    const repository = new PharmacyFlowRepository(prisma);

    await expect(
      repository.createDispense({
        prescriptionId,
        pharmacistId: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
        items: [{ medicationId, quantity: 9 }],
        inventoryDate: new Date('2026-07-30T00:00:00Z'),
      }),
    ).rejects.toThrow('Medication stock changed during dispense');
    expect(tx.dispenseItemStockAllocation.createMany).not.toHaveBeenCalled();
  });
});
