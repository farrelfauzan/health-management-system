import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  BpjsDoctorMappingView,
  BpjsMappingOverviewView,
  BpjsMedicationMappingView,
  BpjsReferenceCatalogValue,
  BpjsSpecialtyMappingView,
  UpdateBpjsDoctorMappingInput,
  UpdateBpjsDphoMappingInput,
  UpdateBpjsPoliMappingInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { BpjsDphoCodeConflictError } from '../repository/bpjs-dpho-code-conflict.error';
import { BpjsMappingRepository } from '../repository/bpjs-mapping.repository';
import { BpjsReferenceRepository } from '../repository/bpjs-reference.repository';

const BPJS_MAPPING_AUDIT_ACTION = 'BPJS_MAPPING_UPDATED' as const;

/**
 * Maintains the BPJS mapping columns (P11-T03): doctor → kdDokter,
 * specialty → kdPoli, medication → DPHO kdObat. A non-null code must exist
 * in the synced local catalog — an unknown code is rejected with a readable
 * message pointing at the sync, so a typo surfaces at mapping time instead
 * of as a rejected pendaftaran with a patient waiting.
 */
@Injectable()
export class BpjsMappingService {
  constructor(
    private readonly mappingRepository: BpjsMappingRepository,
    private readonly referenceRepository: BpjsReferenceRepository,
    private readonly auditService: AuditService,
  ) {}

  async getOverview(): Promise<BpjsMappingOverviewView> {
    const [doctors, specialties] = await Promise.all([
      this.mappingRepository.listDoctorMappings(),
      this.mappingRepository.listSpecialtyMappings(),
    ]);
    return { doctors, specialties };
  }

  async setDoctorMapping(
    doctorId: string,
    input: UpdateBpjsDoctorMappingInput,
    actor: CurrentUser,
  ): Promise<BpjsDoctorMappingView> {
    await this.assertCodeIsKnown('DOKTER', input.bpjsDoctorCode);
    const record = await this.mappingRepository.setDoctorMapping(doctorId, input.bpjsDoctorCode);
    if (record === null) {
      throw new NotFoundException('Doctor not found');
    }
    await this.recordMappingAudit(actor, 'DoctorProfile', doctorId, {
      bpjsDoctorCode: input.bpjsDoctorCode,
    });
    return record;
  }

  async setSpecialtyMapping(
    specialtyId: string,
    input: UpdateBpjsPoliMappingInput,
    actor: CurrentUser,
  ): Promise<BpjsSpecialtyMappingView> {
    await this.assertCodeIsKnown('POLI', input.bpjsPoliCode);
    const record = await this.mappingRepository.setSpecialtyMapping(
      specialtyId,
      input.bpjsPoliCode,
    );
    if (record === null) {
      throw new NotFoundException('Specialty not found');
    }
    await this.recordMappingAudit(actor, 'Specialty', specialtyId, {
      bpjsPoliCode: input.bpjsPoliCode,
    });
    return record;
  }

  async setMedicationMapping(
    medicationId: string,
    input: UpdateBpjsDphoMappingInput,
    actor: CurrentUser,
  ): Promise<BpjsMedicationMappingView> {
    await this.assertCodeIsKnown('DPHO', input.dphoCode);
    const record = await this.executeMedicationWrite(medicationId, input.dphoCode);
    if (record === null) {
      throw new NotFoundException('Medication not found');
    }
    await this.recordMappingAudit(actor, 'Medication', medicationId, {
      dphoCode: input.dphoCode,
    });
    return record;
  }

  private async executeMedicationWrite(
    medicationId: string,
    dphoCode: string | null,
  ): Promise<BpjsMedicationMappingView | null> {
    try {
      return await this.mappingRepository.setMedicationMapping(medicationId, dphoCode);
    } catch (caughtError) {
      if (caughtError instanceof BpjsDphoCodeConflictError) {
        throw new ConflictException(caughtError.message);
      }
      throw caughtError;
    }
  }

  private async assertCodeIsKnown(
    catalog: BpjsReferenceCatalogValue,
    code: string | null,
  ): Promise<void> {
    if (code === null) {
      return;
    }
    const isKnown = await this.referenceRepository.existsByCatalogAndCode(catalog, code);
    if (!isKnown) {
      throw new BadRequestException(
        `Unknown BPJS ${catalog} code "${code}" — sync or search the ${catalog} reference catalog first`,
      );
    }
  }

  private async recordMappingAudit(
    actor: CurrentUser,
    resource: string,
    resourceId: string,
    metadata: Record<string, string | null>,
  ): Promise<void> {
    await this.auditService.record({
      action: BPJS_MAPPING_AUDIT_ACTION,
      resource,
      resourceId,
      actorUserId: actor.sub,
      metadata,
    });
  }
}
