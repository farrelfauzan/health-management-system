import {
  CreateDoctorCredentialOptionInput,
  DoctorCredentialKindValue,
  DoctorCredentialOption,
  DoctorCredentialOptionRecord,
  DoctorCredentialValue,
  ListDoctorCredentialOptionsParams,
  UpdateDoctorCredentialOptionInput,
  resolveDoctorCredentialValue,
} from '@hms/shared-types';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { DoctorCredentialOptionRepository } from '../repository/doctor-credential-option.repository';

const CREDENTIAL_OPTION_AUDIT_RESOURCE = 'DoctorCredentialOption';

/**
 * The catalog behind every credential that prints next to a doctor's name
 * (P19-T14): titles, degrees and education fields of study.
 *
 * Two jobs, and they are deliberately in one place. It serves the master-data
 * screen an admin extends the lists from, and it is what the doctor-management
 * service asks whether a submitted code names a live option — so a code that
 * exists on the form and a code the API accepts can never drift apart.
 *
 * Deactivation, never deletion: an option a clinic stopped using is still the
 * printed form of every doctor profile that already stores its code, so
 * removing the row would turn a credential into an unresolvable string.
 */
@Injectable()
export class DoctorCredentialOptionService {
  constructor(
    private readonly doctorCredentialOptionRepository: DoctorCredentialOptionRepository,
    private readonly auditService: AuditService,
  ) {}

  async listOptions(params: ListDoctorCredentialOptionsParams): Promise<DoctorCredentialOption[]> {
    const options = await this.doctorCredentialOptionRepository.listOptions(params);

    return options.map((option) => this.toOptionResponse(option));
  }

  async createOption(
    payload: CreateDoctorCredentialOptionInput,
    currentUser: CurrentUser,
  ): Promise<DoctorCredentialOption> {
    const existing = await this.doctorCredentialOptionRepository.findOptionByKindAndCode(
      payload.kind,
      payload.code,
    );

    if (existing) {
      throw new ConflictException(`Credential option ${payload.kind}:${payload.code} already exists`);
    }

    const created = await this.doctorCredentialOptionRepository.createOption({
      kind: payload.kind,
      code: payload.code,
      label: payload.label,
      sortOrder: payload.sortOrder,
    });
    await this.auditService.record({
      action: 'CREATE',
      resource: CREDENTIAL_OPTION_AUDIT_RESOURCE,
      resourceId: created.id,
      actorUserId: currentUser.sub,
      metadata: { kind: created.kind, code: created.code, label: created.label },
    });

    return this.toOptionResponse(created);
  }

  async updateOption(
    id: string,
    payload: UpdateDoctorCredentialOptionInput,
    currentUser: CurrentUser,
  ): Promise<DoctorCredentialOption> {
    const existing = await this.doctorCredentialOptionRepository.findOptionById(id);

    if (!existing) {
      throw new NotFoundException('Credential option not found');
    }

    const updated = await this.doctorCredentialOptionRepository.updateOption(id, payload);
    await this.auditService.record({
      action: 'UPDATE',
      resource: CREDENTIAL_OPTION_AUDIT_RESOURCE,
      resourceId: updated.id,
      actorUserId: currentUser.sub,
      metadata: {
        kind: updated.kind,
        code: updated.code,
        label: { from: existing.label, to: updated.label },
        sortOrder: { from: existing.sortOrder, to: updated.sortOrder },
        isActive: { from: existing.isActive, to: updated.isActive },
      },
    });

    return this.toOptionResponse(updated);
  }

  /**
   * Rejects a write whose codes do not name a usable option of that kind, with
   * the offending codes named in `details` so the form can point at the field
   * rather than making an admin guess which of five degrees was wrong.
   *
   * `retainedCodes` are the codes the record already stores. They are accepted
   * even once deactivated, because deactivating an option the clinic stopped
   * handing out must not make every existing holder's profile unsaveable —
   * they only stop being *offered*. Anything else has to be active.
   */
  async assertUsableCodes(params: {
    kind: DoctorCredentialKindValue;
    codes: readonly string[];
    field: string;
    retainedCodes?: readonly string[];
  }): Promise<void> {
    const { kind, codes, field, retainedCodes = [] } = params;
    if (codes.length === 0) {
      return;
    }
    const options = await this.doctorCredentialOptionRepository.listOptions({
      kind,
      includeInactive: true,
    });
    const activeCodes = new Set(
      options.filter((option) => option.isActive).map((option) => option.code),
    );
    const knownCodes = new Set(options.map((option) => option.code));
    const retained = new Set(retainedCodes);
    const unknownCodes = codes.filter(
      (code) => !activeCodes.has(code) && !(knownCodes.has(code) && retained.has(code)),
    );

    if (unknownCodes.length > 0) {
      throw new BadRequestException({
        message: `Unknown or inactive ${kind} credential option`,
        details: { field, unknownCodes },
      });
    }
  }

  /**
   * Resolves stored values for a whole response in one query rather than one
   * per doctor: a directory page renders up to a hundred profiles, and the
   * catalog is small enough to hold entirely.
   */
  async buildResolver(): Promise<(kind: DoctorCredentialKindValue, stored: string) => DoctorCredentialValue> {
    const options = await this.doctorCredentialOptionRepository.listOptions({
      includeInactive: true,
    });
    const optionsByKind = new Map<DoctorCredentialKindValue, DoctorCredentialOptionRecord[]>();
    for (const option of options) {
      const bucket = optionsByKind.get(option.kind) ?? [];
      bucket.push(option);
      optionsByKind.set(option.kind, bucket);
    }

    return (kind, stored) => resolveDoctorCredentialValue(stored, optionsByKind.get(kind) ?? []);
  }

  private toOptionResponse(option: DoctorCredentialOptionRecord): DoctorCredentialOption {
    return {
      id: option.id,
      kind: option.kind,
      code: option.code,
      label: option.label,
      sortOrder: option.sortOrder,
      isActive: option.isActive,
      createdAt: option.createdAt.toISOString(),
      updatedAt: option.updatedAt.toISOString(),
    };
  }
}
