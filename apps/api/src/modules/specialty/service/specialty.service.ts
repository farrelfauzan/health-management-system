import {
  CreateSpecialtyInput,
  ListSpecialtiesParams,
  SPECIALTY_IN_USE_ERROR_CODE,
  SPECIALTY_NAME_TAKEN_ERROR_CODE,
  Specialty,
  SpecialtyRecord,
  UpdateSpecialtyInput,
} from '@hms/shared-types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { SpecialtyRepository } from '../repository/specialty.repository';

const SPECIALTY_AUDIT_RESOURCE = 'Specialty';

/**
 * The clinic's poli catalog. A specialty is what the clinic calls a poli: the
 * queue a registration joins, the audience a consultation tariff prices
 * (D-037), the SATUSEHAT Location a visit reports under and the BPJS kdPoli it
 * registers with.
 *
 * Managed, never deleted. Every doctor, registration, queue counter and
 * invoice points at the row by id, so a poli the clinic stops running is
 * deactivated — it leaves the pickers and keeps its history. Renaming is safe
 * for the same reason: mappings hang off the id and the poli's own columns,
 * not its name.
 */
@Injectable()
export class SpecialtyService {
  constructor(
    private readonly specialtyRepository: SpecialtyRepository,
    private readonly auditService: AuditService,
  ) {}

  async listSpecialties(params: ListSpecialtiesParams): Promise<Specialty[]> {
    const specialties = await this.specialtyRepository.listSpecialties(params);
    return specialties.map((specialty) => this.toSpecialtyResponse(specialty));
  }

  /** Adds a poli. Names are unique without regard to case. */
  async createSpecialty(payload: CreateSpecialtyInput, currentUser: CurrentUser): Promise<Specialty> {
    await this.assertNameAvailable(payload.name);
    const created = await this.specialtyRepository.createSpecialty({
      name: payload.name,
      description: payload.description ?? null,
    });
    await this.auditService.record({
      action: 'CREATE',
      resource: SPECIALTY_AUDIT_RESOURCE,
      resourceId: created.id,
      actorUserId: currentUser.sub,
      metadata: { name: created.name },
    });
    return this.toSpecialtyResponse(created);
  }

  /**
   * Renames, re-describes, deactivates or reactivates a poli. Deactivation is
   * refused while an active clinician practises under it or an active tariff
   * prices it: the clinician could no longer be saved (the doctor form refuses
   * an inactive poli) and the tariff would price a poli nobody can pick.
   */
  async updateSpecialty(
    id: string,
    payload: UpdateSpecialtyInput,
    currentUser: CurrentUser,
  ): Promise<Specialty> {
    const existing = await this.findSpecialtyOrThrow(id);
    if (payload.name !== undefined && payload.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameAvailable(payload.name);
    }
    if (payload.isActive === false && existing.isActive) {
      await this.assertNotInUse(id);
    }
    const updated = await this.specialtyRepository.updateSpecialty(id, payload);
    await this.auditService.record({
      action: 'UPDATE',
      resource: SPECIALTY_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: currentUser.sub,
      metadata: {
        name: { from: existing.name, to: updated.name },
        isActive: { from: existing.isActive, to: updated.isActive },
      },
    });
    return this.toSpecialtyResponse(updated);
  }

  private async findSpecialtyOrThrow(id: string): Promise<SpecialtyRecord> {
    const specialty = await this.specialtyRepository.findSpecialtyById(id);
    if (!specialty) {
      throw new NotFoundException('Specialty not found');
    }
    return specialty;
  }

  private async assertNameAvailable(name: string): Promise<void> {
    const existing = await this.specialtyRepository.findSpecialtyByName(name);
    if (existing) {
      throw new ConflictException({
        code: SPECIALTY_NAME_TAKEN_ERROR_CODE,
        message: `A poli named "${name}" already exists`,
      });
    }
  }

  private async assertNotInUse(id: string): Promise<void> {
    const usage = await this.specialtyRepository.countActiveUsage(id);
    if (usage.activeClinicianCount === 0 && usage.activeTariffCount === 0) {
      return;
    }
    throw new ConflictException({
      code: SPECIALTY_IN_USE_ERROR_CODE,
      message: `This poli is still used by ${usage.activeClinicianCount} active clinician(s) and ${usage.activeTariffCount} active tariff(s); move or deactivate them first`,
      errors: usage,
    });
  }

  private toSpecialtyResponse(specialty: SpecialtyRecord): Specialty {
    return {
      id: specialty.id,
      name: specialty.name,
      description: specialty.description ?? undefined,
      isActive: specialty.isActive,
      createdAt: specialty.createdAt.toISOString(),
      updatedAt: specialty.updatedAt.toISOString(),
    };
  }
}
