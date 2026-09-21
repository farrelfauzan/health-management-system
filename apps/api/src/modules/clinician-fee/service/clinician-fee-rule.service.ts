import {
  CLINICIAN_FEE_RULE_OVERLAP_ERROR_CODE,
  CLINICIAN_FEE_RULE_TARGET_INVALID_ERROR_CODE,
  ClinicianFeeRuleDetailRecord,
  ClinicianFeeRuleView,
  CreateClinicianFeeRuleInput,
  FindClinicianFeeRulesForTargetParams,
  hasOverlappingClinicianFeeRule,
  UpdateClinicianFeeRuleInput,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicianFeeRuleRepository } from '../repository/clinician-fee-rule.repository';
import { ClinicianFeeRuleMapper } from './clinician-fee-rule.mapper';

const CLINICIAN_FEE_RULE_AUDIT_RESOURCE = 'clinician-fee-rule';

function parseCalendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Jasa medis rules (P27-T06). A rule names a tariff or a tariff category and,
 * optionally, one clinician. Two live rules for the same target and clinician
 * may not overlap in time, so exactly one of them is ever in force on a day.
 * Editing a rule changes only future payments: every entry already written
 * carries its own snapshot of the terms.
 */
@Injectable()
export class ClinicianFeeRuleService {
  constructor(
    private readonly clinicianFeeRuleRepository: ClinicianFeeRuleRepository,
    private readonly clinicianFeeRuleMapper: ClinicianFeeRuleMapper,
    private readonly auditService: AuditService,
  ) {}

  async listRules(): Promise<ClinicianFeeRuleView[]> {
    const rules = await this.clinicianFeeRuleRepository.listRules();
    return rules.map((rule) => this.clinicianFeeRuleMapper.toView(rule));
  }

  async createRule(
    input: CreateClinicianFeeRuleInput,
    actor: CurrentUser,
  ): Promise<ClinicianFeeRuleView> {
    const target = {
      serviceTariffId: input.serviceTariffId ?? null,
      category: input.category ?? null,
      doctorId: input.doctorId ?? null,
    };
    await this.assertTargetExists(target);
    await this.assertNoOverlap(target, input);
    const created = await this.clinicianFeeRuleRepository.createRule({
      ...target,
      mode: input.mode,
      value: input.value,
      effectiveFrom: parseCalendarDate(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? parseCalendarDate(input.effectiveTo) : null,
    });
    await this.recordAudit('CREATE', created, actor);
    return this.clinicianFeeRuleMapper.toView(created);
  }

  async updateRule(
    id: string,
    input: UpdateClinicianFeeRuleInput,
    actor: CurrentUser,
  ): Promise<ClinicianFeeRuleView> {
    const existing = await this.findRuleOrThrow(id);
    await this.assertNoOverlap({ ...existing, excludeRuleId: id }, input);
    const updated = await this.clinicianFeeRuleRepository.updateRule({
      id,
      mode: input.mode,
      value: input.value,
      effectiveFrom: parseCalendarDate(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? parseCalendarDate(input.effectiveTo) : null,
    });
    await this.recordAudit('UPDATE', updated, actor);
    return this.clinicianFeeRuleMapper.toView(updated);
  }

  async deleteRule(id: string, actor: CurrentUser): Promise<void> {
    const existing = await this.findRuleOrThrow(id);
    await this.clinicianFeeRuleRepository.softDeleteRule(id, new Date());
    await this.recordAudit('DELETE', existing, actor);
  }

  private async findRuleOrThrow(id: string): Promise<ClinicianFeeRuleDetailRecord> {
    const rule = await this.clinicianFeeRuleRepository.findRuleById(id);
    if (!rule) {
      throw new NotFoundException('Clinician fee rule not found');
    }
    return rule;
  }

  private async assertTargetExists(target: FindClinicianFeeRulesForTargetParams): Promise<void> {
    const state = await this.clinicianFeeRuleRepository.findTargetState(target);
    if (state.isTariffFound && state.isDoctorFound) {
      return;
    }
    throw new BadRequestException({
      code: CLINICIAN_FEE_RULE_TARGET_INVALID_ERROR_CODE,
      message: state.isTariffFound
        ? 'doctorId must name an existing clinician'
        : 'serviceTariffId must name an existing service tariff',
    });
  }

  private async assertNoOverlap(
    target: FindClinicianFeeRulesForTargetParams,
    terms: UpdateClinicianFeeRuleInput,
  ): Promise<void> {
    const existing = await this.clinicianFeeRuleRepository.findRulesForTarget({
      serviceTariffId: target.serviceTariffId,
      category: target.category,
      doctorId: target.doctorId,
      excludeRuleId: target.excludeRuleId,
    });
    const candidate = {
      effectiveFrom: terms.effectiveFrom,
      effectiveTo: terms.effectiveTo ?? null,
    };
    if (!hasOverlappingClinicianFeeRule({ candidate, existing })) {
      return;
    }
    throw new ConflictException({
      code: CLINICIAN_FEE_RULE_OVERLAP_ERROR_CODE,
      message:
        'Another rule for the same service and clinician is in force on some of these dates; end it first',
    });
  }

  private async recordAudit(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    rule: ClinicianFeeRuleDetailRecord,
    actor: CurrentUser,
  ): Promise<void> {
    await this.auditService.record({
      action,
      resource: CLINICIAN_FEE_RULE_AUDIT_RESOURCE,
      resourceId: rule.id,
      actorUserId: actor.sub,
      metadata: {
        serviceTariffId: rule.serviceTariffId,
        category: rule.category,
        doctorId: rule.doctorId,
        mode: rule.mode,
        value: rule.value,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
      },
    });
  }
}
