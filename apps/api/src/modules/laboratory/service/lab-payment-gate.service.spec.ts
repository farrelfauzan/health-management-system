import { LabOrderRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { renderErrorEnvelope } from '../../../common/observability/render-error-envelope';
import { BillingService } from '../../billing/service/billing.service';
import { LabOrderRepository } from '../repository/lab-order.repository';
import { LabPaymentGateService } from './lab-payment-gate.service';

describe('LabPaymentGateService', () => {
  const billingServiceMock = {
    hasSettledInvoiceForVisit: jest.fn(),
    findVisitIdsWithSettledInvoice: jest.fn(),
  };
  const labOrderRepositoryMock = { findWorklistOrderById: jest.fn() };
  const inputOrder = {
    id: 'order-1',
    orderNumber: 'LAB-20260925-0001',
    registrationId: 'registration-1',
  } as LabOrderRecord;

  function buildService(requirePayment: string): LabPaymentGateService {
    return new LabPaymentGateService(
      billingServiceMock as unknown as BillingService,
      labOrderRepositoryMock as unknown as LabOrderRepository,
      new ConfigService({ LAB_REQUIRE_PAYMENT_BEFORE_COLLECTION: requirePayment }),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    labOrderRepositoryMock.findWorklistOrderById.mockResolvedValue({
      id: inputOrder.id,
      registrationId: inputOrder.registrationId,
      patient: { bpjsNumberIndex: null },
    });
    billingServiceMock.hasSettledInvoiceForVisit.mockResolvedValue(false);
  });

  it('never asks about payment while the rule is off', async () => {
    await expect(buildService('false').assertCollectionIsPaidFor(inputOrder)).resolves.toBeUndefined();
    expect(billingServiceMock.hasSettledInvoiceForVisit).not.toHaveBeenCalled();
  });

  it('lets a settled visit collect', async () => {
    billingServiceMock.hasSettledInvoiceForVisit.mockResolvedValue(true);

    await expect(buildService('true').assertCollectionIsPaidFor(inputOrder)).resolves.toBeUndefined();
  });

  it('lets a BPJS patient collect before paying', async () => {
    labOrderRepositoryMock.findWorklistOrderById.mockResolvedValue({
      id: inputOrder.id,
      registrationId: inputOrder.registrationId,
      patient: { bpjsNumberIndex: 'bpjs-index' },
    });

    await expect(buildService('true').assertCollectionIsPaidFor(inputOrder)).resolves.toBeUndefined();
  });

  it('renders an unpaid umum collection as LAB_PAYMENT_REQUIRED, not a bare CONFLICT', async () => {
    const actualError = await buildService('true')
      .assertCollectionIsPaidFor(inputOrder)
      .catch((error: unknown) => error);

    expect(renderErrorEnvelope(actualError)).toEqual({
      status: 409,
      body: {
        error: {
          code: 'LAB_PAYMENT_REQUIRED',
          message: 'Lab order LAB-20260925-0001 must be paid before the specimen is collected',
        },
      },
    });
  });
});
