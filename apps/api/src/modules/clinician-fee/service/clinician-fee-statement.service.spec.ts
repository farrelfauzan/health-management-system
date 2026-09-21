import { NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { ClinicianFeeEntryRepository } from '../repository/clinician-fee-entry.repository';
import { ClinicianFeeStatementService } from './clinician-fee-statement.service';

describe('ClinicianFeeStatementService', () => {
  const doctorA = '11111111-1111-4111-8111-111111111111';
  const doctorB = '22222222-2222-4222-8222-222222222222';
  const actor = { sub: '99999999-9999-4999-8999-999999999999', email: 'admin@hms.local' };

  const repositoryMock = {
    sumPeriodByClinician: jest.fn(),
    findClinicians: jest.fn(),
    findStatementEntries: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn() };
  const service = new ClinicianFeeStatementService(
    repositoryMock as unknown as ClinicianFeeEntryRepository,
    auditServiceMock as unknown as AuditService,
  );

  const accrual = {
    id: 'entry-1',
    kind: 'ACCRUAL' as const,
    invoiceId: 'invoice-1',
    invoiceNumber: 'INV/20261001/0001',
    description: '=Konsultasi, umum',
    itemType: 'CONSULTATION' as const,
    quantity: 1,
    occurredAt: new Date('2026-10-01T03:00:00.000Z'),
    ruleMode: 'PERCENT' as const,
    ruleValue: 60,
    lineAmount: 150_000,
    grossFee: 90_000,
    clinicShare: 60_000,
  };
  const reversal = {
    ...accrual,
    id: 'entry-2',
    kind: 'REVERSAL' as const,
    invoiceNumber: 'INV/20260930/0007',
    description: 'Konsultasi umum',
    lineAmount: -100_000.1,
    grossFee: -60_000.05,
    clinicShare: -40_000.05,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sums a statement in cents, reversals negative', async () => {
    repositoryMock.findClinicians.mockResolvedValue([
      { id: doctorA, fullName: 'dr. A', profession: 'DOCTOR' },
    ]);
    repositoryMock.findStatementEntries.mockResolvedValue([accrual, reversal]);

    const actual = await service.getStatement(doctorA, '2026-10');

    expect(actual.totals).toEqual({
      entryCount: 2,
      lineAmount: 49_999.9,
      grossFee: 29_999.95,
      clinicShare: 19_999.95,
    });
    expect(actual.entries[0]?.occurredAt).toBe('2026-10-01T03:00:00.000Z');
  });

  it('answers 404 for an unknown clinician', async () => {
    repositoryMock.findClinicians.mockResolvedValue([]);

    await expect(service.getStatement(doctorA, '2026-10')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists every clinician of the month by name with the month total', async () => {
    repositoryMock.sumPeriodByClinician.mockResolvedValue([
      {
        doctorId: doctorA,
        entryCount: 2,
        lineAmount: 300_000,
        grossFee: 180_000,
        clinicShare: 120_000,
      },
      {
        doctorId: doctorB,
        entryCount: 1,
        lineAmount: 100_000,
        grossFee: 50_000,
        clinicShare: 50_000,
      },
    ]);
    repositoryMock.findClinicians.mockResolvedValue([
      { id: doctorA, fullName: 'dr. Zaki', profession: 'DOCTOR' },
      { id: doctorB, fullName: 'Bd. Ani', profession: 'MIDWIFE' },
    ]);

    const actual = await service.getPeriodSummary('2026-10');

    expect(actual.clinicians.map((clinician) => clinician.doctorName)).toEqual([
      'Bd. Ani',
      'dr. Zaki',
    ]);
    expect(actual.totals).toEqual({
      entryCount: 3,
      lineAmount: 400_000,
      grossFee: 230_000,
      clinicShare: 170_000,
    });
  });

  it('exports CSV with neutralised text, signed numbers, and an audit row', async () => {
    repositoryMock.findClinicians.mockResolvedValue([
      { id: doctorA, fullName: 'dr. A', profession: 'DOCTOR' },
    ]);
    repositoryMock.findStatementEntries.mockResolvedValue([accrual, reversal]);

    const actual = await service.exportStatement(doctorA, '2026-10', actor);

    expect(actual.fileName).toBe('jasa-medis-2026-10-11111111.csv');
    expect(actual.csv).toContain(`"'=Konsultasi, umum"`);
    expect(actual.csv).toContain(',-100000.1,-60000.05,-40000.05');
    expect(actual.csv).toContain('Total jasa medis (bruto),29999.95');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT', resource: 'clinician-fee-statement' }),
    );
  });
});
