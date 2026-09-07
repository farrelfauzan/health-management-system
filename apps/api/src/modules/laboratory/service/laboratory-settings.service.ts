import {
  LaboratorySettingsRecord,
  LaboratorySettingsView,
  UpdateLaboratorySettingsInput,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { LaboratorySettingsRepository } from '../repository/laboratory-settings.repository';

/**
 * The strict posture, and what a clinic gets before it has decided anything:
 * two different people sign a result out, and a technician is not one of them.
 */
const DEFAULT_LABORATORY_SETTINGS: LaboratorySettingsRecord = {
  technicianMayVerify: false,
  singleOperator: false,
  updatedById: null,
  updatedAt: null,
};

/**
 * How this clinic runs its bench (P18-T04).
 *
 * Both flags loosen a safety rule, so both are stored rather than configured:
 * who may sign a result out is a clinical governance choice a clinic makes and
 * may later be asked to justify, and an environment variable carries no actor,
 * no timestamp, and cannot differ between facilities.
 *
 * An absent row reads as the strict defaults, which is what makes a fresh
 * database safe without a seed row — and why nothing here writes on a read.
 */
@Injectable()
export class LaboratorySettingsService {
  constructor(
    private readonly laboratorySettingsRepository: LaboratorySettingsRepository,
    private readonly auditService: AuditService,
  ) {}

  async getLaboratorySettings(): Promise<LaboratorySettingsRecord> {
    const record = await this.laboratorySettingsRepository.findLaboratorySettings();

    return record ?? DEFAULT_LABORATORY_SETTINGS;
  }

  async getLaboratorySettingsView(): Promise<LaboratorySettingsView> {
    return this.toView(await this.getLaboratorySettings());
  }

  async updateLaboratorySettings(
    payload: UpdateLaboratorySettingsInput,
    currentUser: CurrentUser,
  ): Promise<LaboratorySettingsView> {
    const previous = await this.getLaboratorySettings();
    const updated = await this.laboratorySettingsRepository.upsertLaboratorySettings({
      ...payload,
      updatedById: currentUser.sub,
    });
    await this.auditService.record({
      action: 'UPDATE',
      resource: 'LaboratorySettings',
      actorUserId: currentUser.sub,
      metadata: {
        technicianMayVerify: {
          from: previous.technicianMayVerify,
          to: updated.technicianMayVerify,
        },
        singleOperator: { from: previous.singleOperator, to: updated.singleOperator },
      },
    });

    return this.toView(updated);
  }

  private toView(record: LaboratorySettingsRecord): LaboratorySettingsView {
    return {
      technicianMayVerify: record.technicianMayVerify,
      singleOperator: record.singleOperator,
      updatedById: record.updatedById ?? undefined,
      updatedAt: record.updatedAt ? record.updatedAt.toISOString() : undefined,
    };
  }
}
