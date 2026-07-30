import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  Actor,
  collectNikDemographicWarnings,
  maskIdentifierLast4,
  PatientIdentifierPlaintext,
  PatientIdentifiers,
  PatientRecord,
  PatientSexValue,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { CreatePatientDto } from '../dto/create-patient.dto';
import { ImportPatientDto } from '../dto/import-patient.dto';
import { ListPatientsQueryDto } from '../dto/list-patients-query.dto';
import { UpdatePatientDto } from '../dto/update-patient.dto';
import { PatientIdentifierConflictError } from '../repository/patient-identifier-conflict.error';
import { PatientManagementRepository } from '../repository/patient-management.repository';
import {
  CurrentPrivacyNoticeEvidenceRequiredError,
  PrivacyNoticeRepository,
} from '../../../common/privacy-notice/privacy-notice.repository';

const PATIENT_AUDIT_RESOURCE = 'PatientProfile';

const IDENTIFIER_CONFLICT_MESSAGES = {
  nik: 'NIK already registered to another patient',
  bpjsNumber: 'BPJS number already registered to another patient',
  mrn: 'Patient MRN already exists',
} as const;

function parseDateOnly(value: string): Date {
  const parts = value.split('-');

  if (parts.length !== 3) {
    throw new BadRequestException('Invalid date format');
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new BadRequestException('Invalid date format');
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException('Invalid date value');
  }

  return date;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class PatientManagementService {
  constructor(
    private readonly patientManagementRepository: PatientManagementRepository,
    private readonly authRepository: AuthRepository,
    private readonly auditService: AuditService,
    private readonly privacyNoticeRepository: PrivacyNoticeRepository,
  ) {}

  async listPatients(query: ListPatientsQueryDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Patient', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read patients');
    }

    const result = await this.patientManagementRepository.listPatients(
      {
        page: query.page,
        limit: query.limit,
        search: query.search,
        nik: query.nik,
        bpjsNumber: query.bpjsNumber,
        doctorId: query.doctorId,
        status: query.status,
        hasAppointment:
          query.hasAppointment === undefined ? undefined : query.hasAppointment === 'true',
        createdFrom: query.createdFrom ? parseDateOnly(query.createdFrom) : undefined,
        createdTo: query.createdTo ? parseDateOnly(query.createdTo) : undefined,
      },
      currentUser,
      readScope.hasAny,
    );

    return {
      items: result.items.map((patient) => ({
        id: patient.id,
        fullName: patient.fullName,
        status: patient.status,
        isActive: patient.isActive,
        doctorCount: patient._count.doctors,
        allergyCount: patient._count.allergies,
        doctors: patient.doctors.map((assignment) => ({
          id: assignment.doctor.id,
          assignmentId: assignment.id,
          fullName: assignment.doctor.fullName,
          specialty: assignment.doctor.specialty.name,
        })),
      })),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  async getPatientById(id: string, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Patient', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read this patient');
    }

    const patient = await this.patientManagementRepository.findPatientDetailById(id);

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    if (!readScope.hasAny && !(await this.canReadOwnPatient(patient, currentUser))) {
      throw new ForbiddenException('You are not allowed to read this patient');
    }

    return {
      ...this.toPatientResponse(patient),
      doctors: patient.doctors.map((assignment) => ({
        id: assignment.doctor.id,
        assignmentId: assignment.id,
        fullName: assignment.doctor.fullName,
        specialty: assignment.doctor.specialty.name,
      })),
      allergies: patient.allergies.map((allergy) => ({
        id: allergy.id,
        substance: allergy.substance,
        reaction: allergy.reaction ?? undefined,
        severity: allergy.severity,
        createdAt: allergy.createdAt.toISOString(),
        updatedAt: allergy.updatedAt.toISOString(),
      })),
    };
  }

  async createPatient(payload: CreatePatientDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const createScope = this.resolveScope(actor, 'Patient', 'create');

    if (!createScope.hasAny) {
      throw new ForbiddenException('You are not allowed to create patients');
    }

    this.assertPrivacyNoticeActorRules(payload.privacyNotice, false);

    if (payload.ownerUserId) {
      const ownerUser = await this.patientManagementRepository.findActiveUserById(payload.ownerUserId);

      if (!ownerUser) {
        throw new BadRequestException('Owner user not found');
      }
    }

    await this.assertAssignableDoctorIds(payload.doctorIds);
    await this.assertIdentifiersAvailable({ nik: payload.nik, bpjsNumber: payload.bpjsNumber });

    const created = await this.createPatientRecord(payload, currentUser);

    return {
      patient: this.toPatientResponse(created),
      identifierWarnings: this.collectIdentifierWarnings({
        nik: payload.nik,
        dateOfBirth: payload.dateOfBirth,
        sex: payload.sex,
      }),
    };
  }

  /**
   * Registers a patient whose MRN comes from the clinic's previous system.
   * Separate from {@link createPatient} and separately permissioned, because
   * accepting a caller-supplied MRN is exactly what the generated path exists to
   * prevent — it is allowed only while migrating numbers already printed on
   * physical folders, and the counter is lifted past every imported value so the
   * number can never be handed out again.
   */
  async importPatient(payload: ImportPatientDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const importScope = this.resolveScope(actor, 'Patient', 'import-identifier');

    if (!importScope.hasAny) {
      throw new ForbiddenException('You are not allowed to import patient identifiers');
    }

    this.assertPrivacyNoticeActorRules(payload.privacyNotice, false);

    const existingPatient = await this.patientManagementRepository.findPatientByMrn(payload.mrn);

    if (existingPatient) {
      throw new ConflictException('Patient MRN already exists');
    }

    if (payload.ownerUserId) {
      const ownerUser = await this.patientManagementRepository.findActiveUserById(payload.ownerUserId);

      if (!ownerUser) {
        throw new BadRequestException('Owner user not found');
      }
    }

    await this.assertAssignableDoctorIds(payload.doctorIds);
    await this.assertIdentifiersAvailable({ nik: payload.nik, bpjsNumber: payload.bpjsNumber });

    const created = await this.createPatientRecord(payload, currentUser);

    await this.auditService.record({
      action: 'PATIENT_MRN_IMPORTED',
      resource: PATIENT_AUDIT_RESOURCE,
      resourceId: created.id,
      actorUserId: currentUser.sub,
    });

    return {
      patient: this.toPatientResponse(created),
      identifierWarnings: this.collectIdentifierWarnings({
        nik: payload.nik,
        dateOfBirth: payload.dateOfBirth,
        sex: payload.sex,
      }),
    };
  }

  /**
   * Reveals the decrypted identifiers for one patient. Decryption is a
   * privileged operation, not a side effect of reading a patient, so it needs
   * `patient.read-identifier` and leaves an audit trail — the `OWN` scope is
   * strictly the patient themselves, never a treating doctor, because clinical
   * work runs on the MRN.
   */
  async getPatientIdentifiers(id: string, currentUser: CurrentUser): Promise<PatientIdentifiers> {
    const actor = await this.getActorOrThrow(currentUser);
    const revealScope = this.resolveScope(actor, 'Patient', 'read-identifier');

    if (!revealScope.hasAny && !revealScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read patient identifiers');
    }

    const patient = await this.patientManagementRepository.findPatientById(id);

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    if (!revealScope.hasAny && patient.ownerUserId !== currentUser.sub) {
      throw new ForbiddenException('You are not allowed to read this patient identifiers');
    }

    const identifiers = await this.patientManagementRepository.findPatientIdentifiers(id);

    if (!identifiers) {
      throw new NotFoundException('Patient not found');
    }

    // Recorded before the values leave the service, and deliberately without
    // them: the audit row says which identifiers were revealed, never what they
    // were.
    await this.auditService.record({
      action: 'PATIENT_IDENTIFIER_UNMASKED',
      resource: PATIENT_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: currentUser.sub,
      metadata: {
        scope: revealScope.hasAny ? 'ANY' : 'OWN',
        fields: this.listRevealedFields(identifiers),
      },
    });

    return {
      id: patient.id,
      mrn: patient.mrn,
      nik: identifiers.nik ?? undefined,
      bpjsNumber: identifiers.bpjsNumber ?? undefined,
      satusehatPatientId: identifiers.satusehatPatientId ?? undefined,
    };
  }

  async updatePatient(id: string, payload: UpdatePatientDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const updateScope = this.resolveScope(actor, 'Patient', 'update');

    if (!updateScope.hasAny && !updateScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to update patients');
    }

    const patient = await this.patientManagementRepository.findPatientById(id);

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const isOwner = patient.ownerUserId === currentUser.sub;

    if (!updateScope.hasAny && !isOwner) {
      throw new ForbiddenException('You are not allowed to update this patient');
    }

    if (!updateScope.hasAny && payload.ownerUserId !== undefined) {
      throw new ForbiddenException('You are not allowed to change patient owner');
    }

    if (payload.ownerUserId) {
      const ownerUser = await this.patientManagementRepository.findActiveUserById(payload.ownerUserId);

      if (!ownerUser) {
        throw new BadRequestException('Owner user not found');
      }
    }

    await this.assertIdentifiersAvailable(
      { nik: payload.nik, bpjsNumber: payload.bpjsNumber },
      id,
    );

    const updated = await this.updatePatientRecord(id, payload);

    return {
      patient: this.toPatientResponse(updated),
      identifierWarnings: this.collectIdentifierWarnings({
        nik: payload.nik,
        dateOfBirth: payload.dateOfBirth ?? toDateOnly(patient.dateOfBirth),
        sex: payload.sex ?? patient.sex ?? undefined,
      }),
    };
  }

  async getCurrentPrivacyNotice(currentUser: CurrentUser) {
    await this.getActorOrThrow(currentUser);
    const notice = await this.privacyNoticeRepository.findCurrentVersion();
    if (!notice) {
      throw new NotFoundException('Current privacy notice not found');
    }
    return {
      id: notice.id,
      version: notice.version,
      effectiveAt: notice.effectiveAt.toISOString(),
      content: { id: notice.contentId, en: notice.contentEn },
      contentHash: { id: notice.contentHashId, en: notice.contentHashEn },
      counselApproved: notice.counselApproved,
    };
  }

  async getPatientPrivacyNoticeHistory(id: string, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Patient', 'read');
    const patient = await this.patientManagementRepository.findPatientById(id);
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    if (!readScope.hasAny && (!readScope.hasOwn || patient.ownerUserId !== currentUser.sub)) {
      throw new ForbiddenException('You are not allowed to read this privacy notice history');
    }
    const [current, history, currentRecord] = await Promise.all([
      this.privacyNoticeRepository.findCurrentVersion(),
      this.privacyNoticeRepository.findPatientHistory(id),
      this.privacyNoticeRepository.findCurrentPatientRecord(id),
    ]);
    if (!current) {
      throw new NotFoundException('Current privacy notice not found');
    }
    return {
      status: {
        currentNoticeVersionId: current.id,
        currentVersion: current.version,
        outcome: currentRecord?.outcome,
        recordedAt: currentRecord?.recordedAt.toISOString(),
        requiresCapture: currentRecord === null,
      },
      history: history.map((record) => ({
        id: record.id,
        privacyNoticeVersionId: record.privacyNoticeVersionId,
        version: record.version,
        outcome: record.outcome,
        locale: record.locale,
        contentHash: record.contentHash,
        subjectType: record.subjectType,
        representativeName: record.representativeName ?? undefined,
        representativeRelation: record.representativeRelation ?? undefined,
        actorUserId: record.actorUserId,
        provenance: record.provenance,
        recordedAt: record.recordedAt.toISOString(),
      })),
    };
  }

  private async createPatientRecord(
    payload: CreatePatientDto & { mrn?: string },
    currentUser: CurrentUser,
  ): Promise<PatientRecord> {
    try {
      return await this.patientManagementRepository.createPatient({
        // Absent on the ordinary create path, where the repository allocates
        // the next number from the counter.
        mrn: payload.mrn,
        fullName: payload.fullName,
        dateOfBirth: parseDateOnly(payload.dateOfBirth),
        placeOfBirth: payload.placeOfBirth,
        sex: payload.sex,
        status: payload.status,
        phoneNumber: payload.phoneNumber,
        address: payload.address,
        nik: payload.nik,
        bpjsNumber: payload.bpjsNumber,
        email: payload.email,
        bloodType: payload.bloodType,
        rhesusFactor: payload.rhesusFactor,
        maritalStatus: payload.maritalStatus,
        occupation: payload.occupation,
        religion: payload.religion,
        emergencyContactName: payload.emergencyContactName,
        emergencyContactPhone: payload.emergencyContactPhone,
        guardianName: payload.guardianName,
        guardianRelation: payload.guardianRelation,
        allergies: payload.allergies,
        ownerUserId: payload.ownerUserId,
        isActive: payload.isActive,
        doctorIds: payload.doctorIds,
        actorUserId: currentUser.sub,
        privacyNotice: payload.privacyNotice,
      });
    } catch (err) {
      if (err instanceof CurrentPrivacyNoticeEvidenceRequiredError) {
        throw new BadRequestException(err.message);
      }
      throw this.toIdentifierConflictException(err);
    }
  }

  private async updatePatientRecord(
    id: string,
    payload: UpdatePatientDto,
  ): Promise<PatientRecord> {
    try {
      return await this.patientManagementRepository.updatePatient(id, {
        fullName: payload.fullName,
        dateOfBirth: payload.dateOfBirth ? parseDateOnly(payload.dateOfBirth) : undefined,
        placeOfBirth: payload.placeOfBirth,
        sex: payload.sex,
        status: payload.status,
        phoneNumber: payload.phoneNumber,
        address: payload.address,
        nik: payload.nik,
        bpjsNumber: payload.bpjsNumber,
        email: payload.email,
        bloodType: payload.bloodType,
        rhesusFactor: payload.rhesusFactor,
        maritalStatus: payload.maritalStatus,
        occupation: payload.occupation,
        religion: payload.religion,
        emergencyContactName: payload.emergencyContactName,
        emergencyContactPhone: payload.emergencyContactPhone,
        guardianName: payload.guardianName,
        guardianRelation: payload.guardianRelation,
        allergies: payload.allergies,
        ownerUserId: payload.ownerUserId,
        isActive: payload.isActive,
      });
    } catch (err) {
      throw this.toIdentifierConflictException(err);
    }
  }

  /**
   * Rejects a create or update that would attach an identifier already held by
   * another patient. A collision means the two records are the same person, so
   * the operation is refused and routed to the duplicate-merge workflow rather
   * than producing a second record.
   */
  private async assertIdentifiersAvailable(
    identifiers: { nik?: string | null; bpjsNumber?: string | null },
    excludePatientId?: string,
  ): Promise<void> {
    if (identifiers.nik) {
      const existing = await this.patientManagementRepository.findPatientIdByNik(identifiers.nik);
      if (existing && existing.id !== excludePatientId) {
        throw new ConflictException('NIK already registered to another patient');
      }
    }
    if (identifiers.bpjsNumber) {
      const existing = await this.patientManagementRepository.findPatientIdByBpjsNumber(
        identifiers.bpjsNumber,
      );
      if (existing && existing.id !== excludePatientId) {
        throw new ConflictException('BPJS number already registered to another patient');
      }
    }
  }

  private toIdentifierConflictException(err: unknown): unknown {
    if (err instanceof PatientIdentifierConflictError) {
      return new ConflictException(IDENTIFIER_CONFLICT_MESSAGES[err.field]);
    }
    return err;
  }

  /**
   * Names the identifiers an unmask actually returned, so the audit row records
   * the shape of the disclosure without recording the values themselves.
   */
  private listRevealedFields(identifiers: PatientIdentifierPlaintext): string[] {
    return Object.entries(identifiers)
      .filter(([, value]) => value !== null)
      .map(([field]) => field);
  }

  private collectIdentifierWarnings(input: {
    nik?: string | null;
    dateOfBirth?: string;
    sex?: PatientSexValue;
  }): string[] {
    if (!input.nik) {
      return [];
    }
    return collectNikDemographicWarnings({
      nik: input.nik,
      dateOfBirth: input.dateOfBirth,
      sex: input.sex,
    });
  }

  private async canReadOwnPatient(
    patient: Pick<PatientRecord, 'id' | 'ownerUserId'>,
    currentUser: CurrentUser,
  ): Promise<boolean> {
    if (patient.ownerUserId === currentUser.sub) {
      return true;
    }

    return this.patientManagementRepository.hasActiveAssignmentWithDoctorUser(
      patient.id,
      currentUser.sub,
    );
  }

  private async assertAssignableDoctorIds(doctorIds?: string[]): Promise<void> {
    if (!doctorIds || doctorIds.length === 0) {
      return;
    }

    const uniqueDoctorIds = new Set(doctorIds);

    if (uniqueDoctorIds.size !== doctorIds.length) {
      throw new BadRequestException('Doctor IDs must be unique');
    }

    const activeDoctors = await this.patientManagementRepository.findActiveDoctorsByIds(doctorIds);

    if (activeDoctors.length !== doctorIds.length) {
      const foundDoctorIds = new Set(activeDoctors.map((doctor) => doctor.id));
      const missingDoctorIds = doctorIds.filter((doctorId) => !foundDoctorIds.has(doctorId));

      throw new BadRequestException(
        `Doctors not found or inactive: ${missingDoctorIds.join(', ')}`,
      );
    }
  }

  private async getActorOrThrow(currentUser: CurrentUser): Promise<Actor> {
    const actor = await this.authRepository.findUserById(currentUser.sub);

    if (!actor) {
      throw new UnauthorizedException('User not found');
    }

    return actor;
  }

  private resolveScope(actor: Actor, resource: string, action: string) {
    const permissions = actor.roles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => rolePermission.permission),
    );

    const hasAny = permissions.some(
      (permission) =>
        permission.resource === resource && permission.action === action && permission.scope === 'ANY',
    );
    const hasOwn = permissions.some(
      (permission) =>
        permission.resource === resource && permission.action === action && permission.scope === 'OWN',
    );

    return {
      hasAny,
      hasOwn,
    };
  }

  /**
   * Identifiers leave the API masked. Full values come only from
   * {@link getPatientIdentifiers}, which requires `patient.read-identifier` and
   * audits the disclosure.
   */
  private toPatientResponse(patient: PatientRecord) {
    return {
      id: patient.id,
      mrn: patient.mrn,
      fullName: patient.fullName,
      dateOfBirth: toDateOnly(patient.dateOfBirth),
      placeOfBirth: patient.placeOfBirth ?? undefined,
      sex: patient.sex ?? undefined,
      status: patient.status,
      phoneNumber: patient.phoneNumber,
      address: patient.address,
      nikMasked: maskIdentifierLast4(patient.nikLast4),
      bpjsNumberMasked: maskIdentifierLast4(patient.bpjsNumberLast4),
      hasSatusehatPatientId: patient.hasSatusehatPatientId,
      email: patient.email ?? undefined,
      bloodType: patient.bloodType ?? undefined,
      rhesusFactor: patient.rhesusFactor ?? undefined,
      maritalStatus: patient.maritalStatus ?? undefined,
      occupation: patient.occupation ?? undefined,
      religion: patient.religion ?? undefined,
      emergencyContactName: patient.emergencyContactName ?? undefined,
      emergencyContactPhone: patient.emergencyContactPhone ?? undefined,
      guardianName: patient.guardianName ?? undefined,
      guardianRelation: patient.guardianRelation ?? undefined,
      ownerUserId: patient.ownerUserId ?? undefined,
      isActive: patient.isActive,
      lastVisitAt: patient.lastVisitAt?.toISOString(),
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
    };
  }

  private assertPrivacyNoticeActorRules(
    evidence: CreatePatientDto['privacyNotice'],
    isOwnPatient: boolean,
  ): void {
    if (isOwnPatient && evidence.subjectType === 'REPRESENTATIVE') {
      throw new ForbiddenException('Patients cannot act as their own representative');
    }
    if (isOwnPatient && evidence.outcome === 'DEFERRED_EMERGENCY') {
      throw new ForbiddenException('Emergency privacy notice deferral is staff-only');
    }
  }
}
