import { UnauthorizedException } from '@nestjs/common';

import { PharmacyFlowService } from '../service/pharmacy-flow.service';
import { InventoryController } from './inventory.controller';

describe('InventoryController', () => {
  const pharmacyFlowService = {
    listStockReceipts: jest.fn(),
    createStockReceipt: jest.fn(),
    getInventorySummary: jest.fn(),
    getExpiryReport: jest.fn(),
  } as unknown as PharmacyFlowService;
  const serviceMock = pharmacyFlowService as unknown as {
    listStockReceipts: jest.Mock;
    createStockReceipt: jest.Mock;
    getInventorySummary: jest.Mock;
    getExpiryReport: jest.Mock;
  };
  const controller = new InventoryController(pharmacyFlowService);
  const currentUser = { sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8', email: 'pharmacist@hms.local' };

  beforeEach(() => jest.clearAllMocks());

  it('returns the receipt list envelope from the service', async () => {
    serviceMock.listStockReceipts.mockResolvedValue({
      items: [{ id: 'receipt-1' }],
      meta: { page: 1, limit: 10, total: 1 },
    });

    const result = await controller.listReceipts({ page: 1, limit: 10 }, currentUser);

    expect(result).toEqual({
      data: [{ id: 'receipt-1' }],
      meta: { page: 1, limit: 10, total: 1 },
    });
  });

  it('returns the create message envelope', async () => {
    const payload = {
      medicationId: '9a1f34c8-8e10-4d0e-8c31-4f6a1de1a004',
      batchNumber: 'LOT-01',
      expiryDate: '2028-01-31',
      quantity: 10,
    };
    serviceMock.createStockReceipt.mockResolvedValue({ id: 'receipt-1' });

    const result = await controller.createReceipt(payload, currentUser);

    expect(result).toEqual({ data: { id: 'receipt-1' }, message: 'Stock receipt created' });
    expect(serviceMock.createStockReceipt).toHaveBeenCalledWith(payload, currentUser);
  });

  it('rejects a missing authenticated user before calling the service', async () => {
    await expect(controller.getSummary()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(serviceMock.getInventorySummary).not.toHaveBeenCalled();
  });
});
