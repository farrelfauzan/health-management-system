import {
  CLINICIAN_FEE_RULE_OVERLAP_ERROR_CODE,
  CLINICIAN_FEE_RULE_TARGET_INVALID_ERROR_CODE,
  ClinicianFeeRuleDetailRecord,
} from '@hms/shared-types';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { ClinicianFeeRuleRepository } from '../repository/clinician-fee-rule.repository';
import { ClinicianFeeRuleMapper } from './clinician-fee-rule.mapper';
import { ClinicianFeeRuleService } from './clinician-fee-rule.service';

describe('ClinicianFeeRuleService', () => {
  const doctorA = '11111111-1111-4111-8111-111111111111';
  const actor = { sub: '99999999-9999-4999-8999-999999999999', email: 'admin@hms.local' };
  const timestamp = new Date('2026-10-01T03:00:00.000Z');

  const storedRule: ClinicianFeeRuleDetailRecord = {
    id: 'rule-60',
    serviceTariffId: null,
    category: 'CONSULTATION',
    doctorId: doctorA,
    mode: 'PERCENT',
    value: 60,
    effectiveFrom: '2026-10-01',
    effectiveTo: null,
    serviceTariff: null,
    doctor: { fullName: 'dr. A', profession: 'DOCTOR' },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const repositoryMock = {
    listRules: jest.fn(),
    findRuleById: jest.fn(),
    findRulesForTarget: jest.fn(),
    findTargetState: jest.fn(),
    createRule: jest.fn(),
    updateRule: jest.fn(),
    softDeleteRule: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn() };

  const service = new ClinicianFeeRuleService(
    repositoryMock as unknown as ClinicianFeeRuleRepository,
    new ClinicianFeeRuleMapper(),
    auditServiceMock as unknown as AuditService,
  );

  const inputCreate = {
    category: 'CONSULTATION' as const,
    doctorId: doctorA,
    mode: 'PERCENT' as const,
    value: 60,
    effectiveFrom: '2026-10-01',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.findTargetState.mockResolvedValue({ isTariffFound: true, isDoctorFound: true });
    repositoryMock.findRulesForTarget.mockResolvedValue([]);
  });

  it('creates a clinician + category rule and audits it', async () => {
    repositoryMock.createRule.mockResolvedValue(storedRule);

    const actual = await service.createRule(inputCreate, actor);

    expect(actual).toEqual(
      expect.objectContaining({ id: 'rule-60', level: 'CLINICIAN_CATEGORY', doctorName: 'dr. A' }),
    );
    expect(repositoryMock.createRule).toHaveBeenCalledWith({
      serviceTariffId: null,
      category: 'CONSULTATION',
      doctorId: doctorA,
      mode: 'PERCENT',
      value: 60,
      effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
      effectiveTo: null,
    });
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', resource: 'clinician-fee-rule' }),
    );
  });

  it('refuses a rule overlapping another for the same target and clinician', async () => {
    repositoryMock.findRulesForTarget.mockResolvedValue([storedRule]);

    const actualError = await service
      .createRule(inputCreate, actor)
      .catch((error: unknown) => error);

    expect(actualError).toBeInstanceOf(ConflictException);
    expect((actualError as ConflictException).getResponse()).toEqual(
      expect.objectContaining({ code: CLINICIAN_FEE_RULE_OVERLAP_ERROR_CODE }),
    );
    expect(repositoryMock.createRule).not.toHaveBeenCalled();
  });

  it('refuses an unknown clinician', async () => {
    repositoryMock.findTargetState.mockResolvedValue({ isTariffFound: true, isDoctorFound: false });

    const actualError = await service
      .createRule(inputCreate, actor)
      .catch((error: unknown) => error);

    expect(actualError).toBeInstanceOf(BadRequestException);
    expect((actualError as BadRequestException).getResponse()).toEqual(
      expect.objectContaining({ code: CLINICIAN_FEE_RULE_TARGET_INVALID_ERROR_CODE }),
    );
  });

  it('checks overlap on update against the other rules only', async () => {
    repositoryMock.findRuleById.mockResolvedValue(storedRule);
    repositoryMock.updateRule.mockResolvedValue({ ...storedRule, value: 65 });

    await service.updateRule(
      'rule-60',
      { mode: 'PERCENT', value: 65, effectiveFrom: '2026-10-01' },
      actor,
    );

    expect(repositoryMock.findRulesForTarget).toHaveBeenCalledWith({
      serviceTariffId: null,
      category: 'CONSULTATION',
      doctorId: doctorA,
      excludeRuleId: 'rule-60',
    });
  });

  it('answers 404 when deleting a rule that does not exist', async () => {
    repositoryMock.findRuleById.mockResolvedValue(null);

    await expect(service.deleteRule('missing', actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(repositoryMock.softDeleteRule).not.toHaveBeenCalled();
  });
});
