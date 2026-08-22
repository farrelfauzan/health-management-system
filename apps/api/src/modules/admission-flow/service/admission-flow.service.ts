import {
  AdmissionRecord,
  AdmissionResponse,
  AdmissionsListMeta,
  BedAssignmentRecord,
  canTransitionAdmissionStatus,
  UpdateAdmissionRecordPayload,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { BedService } from '../../room-management/service/bed.service';
import { AdmitPatientDto } from '../dto/admit-patient.dto';
import { CancelAdmissionDto } from '../dto/cancel-admission.dto';
import { DischargeAdmissionDto } from '../dto/discharge-admission.dto';
import { ListAdmissionsQueryDto } from '../dto/list-admissions-query.dto';
import { TransferAdmissionDto } from '../dto/transfer-admission.dto';
import { UpdateAdmissionDto } from '../dto/update-admission.dto';
import { AdmissionConflictError } from '../repository/admission-conflict.error';
import { AdmissionFlowRepository } from '../repository/admission-flow.repository';
import { AdmissionReferenceRepository } from '../repository/admission-reference.repository';
import { AdmissionAccessService } from './admission-access.service';
import { AdmissionMapper } from './admission.mapper';

/**
 * Admit, transfer, discharge, cancel — the four things that happen to an
 * inpatient stay.
 *
 * Each one is a single repository transaction, and the guards that make them
 * safe under concurrency are IMP-11's partial unique indexes rather than the
 * reads in this file: the checks here exist to produce a readable 400 or 409
 * for the ordinary case, and the constraint exists to be right when two
 * requests arrive at once.
 */
@Injectable()
export class AdmissionFlowService {
  constructor(
    private readonly admissionFlowRepository: AdmissionFlowRepository,
    private readonly admissionReferenceRepository: AdmissionReferenceRepository,
    private readonly admissionAccessService: AdmissionAccessService,
    private readonly bedService: BedService,
    private readonly admissionMapper: AdmissionMapper,
  ) {}

  async listAdmissions(
    query: ListAdmissionsQueryDto,
    currentUser: CurrentUser,
  ): Promise<{ items: AdmissionResponse[]; meta: AdmissionsListMeta }> {
    const scope = await this.admissionAccessService.resolveReadScopeOrThrow(currentUser);
    const result = await this.admissionFlowRepository.listAdmissions({
      page: query.page,
      limit: query.limit,
      status: query.status,
      patientId: query.patientId,
      admittingDoctorId: query.admittingDoctorId,
      wardId: query.wardId,
      search: query.search,
      ownerUserId: scope.hasAny ? undefined : currentUser.sub,
    });

    return {
      items: result.items.map((admission) => this.admissionMapper.toAdmissionResponse(admission)),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async getAdmission(id: string, currentUser: CurrentUser): Promise<AdmissionResponse> {
    const scope = await this.admissionAccessService.resolveReadScopeOrThrow(currentUser);
    const admission = await this.getAdmissionOrThrow(id);
    await this.admissionAccessService.assertCanReadAdmission({ admission, scope, currentUser });

    return this.admissionMapper.toAdmissionResponse(admission);
  }

  async admitPatient(payload: AdmitPatientDto, currentUser: CurrentUser): Promise<AdmissionResponse> {
    await this.admissionAccessService.assertCanRunLifecycleOrThrow(currentUser, 'admit');
    await this.assertPatientExists(payload.patientId);
    await this.assertDoctorIsActive(payload.admittingDoctorId);
    await this.assertSourceEncounterBelongsToPatient(payload.sourceEncounterId, payload.patientId);
    await this.assertBedIsFree(payload.bedId);

    try {
      const admission = await this.admissionFlowRepository.admitPatient({
        patientId: payload.patientId,
        admittingDoctorId: payload.admittingDoctorId,
        bedId: payload.bedId,
        sourceEncounterId: payload.sourceEncounterId,
        reason: payload.reason,
        admittedAt: payload.admittedAt ? new Date(payload.admittedAt) : new Date(),
        createdById: currentUser.sub,
      });
      return this.admissionMapper.toAdmissionResponse(admission);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async transferAdmission(
    id: string,
    payload: TransferAdmissionDto,
    currentUser: CurrentUser,
  ): Promise<AdmissionResponse> {
    await this.admissionAccessService.assertCanRunLifecycleOrThrow(currentUser, 'transfer');
    const admission = await this.getAdmissionOrThrow(id);
    this.assertAdmissionIsOpen(admission);
    const currentAssignment = this.getOpenAssignmentOrThrow(admission);

    if (currentAssignment.bed.id === payload.bedId) {
      throw new ConflictException('The patient is already in that bed');
    }

    await this.assertBedIsFree(payload.bedId);
    const effectiveAt = this.resolveEffectiveAt(payload.effectiveAt, currentAssignment.startedAt);

    try {
      const transferred = await this.admissionFlowRepository.transferAdmission({
        admissionId: admission.id,
        currentAssignmentId: currentAssignment.id,
        currentBedId: currentAssignment.bed.id,
        targetBedId: payload.bedId,
        effectiveAt,
        createdById: currentUser.sub,
      });
      return this.admissionMapper.toAdmissionResponse(transferred);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async dischargeAdmission(
    id: string,
    payload: DischargeAdmissionDto,
    currentUser: CurrentUser,
  ): Promise<AdmissionResponse> {
    await this.admissionAccessService.assertCanRunLifecycleOrThrow(currentUser, 'discharge');
    const admission = await this.getAdmissionOrThrow(id);
    this.assertTransitionAllowed(admission, 'DISCHARGED');
    const currentAssignment = this.getOpenAssignmentOrThrow(admission);
    const dischargedAt = this.resolveEffectiveAt(
      payload.dischargedAt,
      currentAssignment.startedAt,
    );

    const discharged = await this.admissionFlowRepository.dischargeAdmission({
      admissionId: admission.id,
      currentAssignmentId: currentAssignment.id,
      currentBedId: currentAssignment.bed.id,
      dischargedAt,
      dischargeSummary: payload.dischargeSummary,
    });

    return this.admissionMapper.toAdmissionResponse(discharged);
  }

  async cancelAdmission(
    id: string,
    payload: CancelAdmissionDto,
    currentUser: CurrentUser,
  ): Promise<AdmissionResponse> {
    await this.admissionAccessService.assertCanRunLifecycleOrThrow(currentUser, 'cancel');
    const admission = await this.getAdmissionOrThrow(id);
    this.assertTransitionAllowed(admission, 'CANCELLED');
    const currentAssignment = admission.bedAssignments.find(
      (assignment) => assignment.endedAt === null,
    );

    const cancelled = await this.admissionFlowRepository.cancelAdmission({
      admissionId: admission.id,
      currentAssignmentId: currentAssignment?.id ?? null,
      currentBedId: currentAssignment?.bed.id ?? null,
      cancelledAt: new Date(),
      cancelReason: payload.reason,
    });

    return this.admissionMapper.toAdmissionResponse(cancelled);
  }

  async updateAdmission(
    id: string,
    payload: UpdateAdmissionDto,
    currentUser: CurrentUser,
  ): Promise<AdmissionResponse> {
    await this.admissionAccessService.assertCanRunLifecycleOrThrow(currentUser, 'update');
    const admission = await this.getAdmissionOrThrow(id);
    this.assertAdmissionIsOpen(admission);

    if (payload.admittingDoctorId !== undefined) {
      await this.assertDoctorIsActive(payload.admittingDoctorId);
    }

    const updated = await this.admissionFlowRepository.updateAdmission(
      this.buildUpdatePayload(id, payload),
    );

    return this.admissionMapper.toAdmissionResponse(updated);
  }

  private buildUpdatePayload(
    id: string,
    payload: UpdateAdmissionDto,
  ): UpdateAdmissionRecordPayload {
    return {
      id,
      ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
      ...(payload.admittingDoctorId !== undefined
        ? { admittingDoctorId: payload.admittingDoctorId }
        : {}),
    };
  }

  private async getAdmissionOrThrow(id: string): Promise<AdmissionRecord> {
    const admission = await this.admissionFlowRepository.findAdmissionById(id);

    if (!admission) {
      throw new NotFoundException('Admission not found');
    }

    return admission;
  }

  private getOpenAssignmentOrThrow(admission: AdmissionRecord): BedAssignmentRecord {
    const openAssignment = admission.bedAssignments.find(
      (assignment) => assignment.endedAt === null,
    );

    if (!openAssignment) {
      throw new ConflictException('This admission holds no bed');
    }

    return openAssignment;
  }

  private assertAdmissionIsOpen(admission: AdmissionRecord): void {
    if (admission.status !== 'ADMITTED') {
      throw new ConflictException(
        `Admission in status ${admission.status} can no longer be modified`,
      );
    }
  }

  private assertTransitionAllowed(
    admission: AdmissionRecord,
    toStatus: 'CANCELLED' | 'DISCHARGED',
  ): void {
    if (!canTransitionAdmissionStatus(admission.status, toStatus)) {
      throw new ConflictException(
        `Admission status can not change from ${admission.status} to ${toStatus}`,
      );
    }
  }

  private async assertPatientExists(patientId: string): Promise<void> {
    const patient = await this.admissionReferenceRepository.findLivePatient(patientId);

    if (!patient) {
      throw new BadRequestException('Patient not found');
    }
  }

  private async assertDoctorIsActive(doctorId: string): Promise<void> {
    const doctor = await this.admissionReferenceRepository.findLiveDoctor(doctorId);

    if (!doctor || !doctor.isActive) {
      throw new BadRequestException('Admitting doctor not found or inactive');
    }
  }

  /**
   * A referral must name the same patient. Without this, an admission could
   * cite a stranger's consultation as its clinical justification, and the
   * foreign key would never notice.
   */
  private async assertSourceEncounterBelongsToPatient(
    sourceEncounterId: string | undefined,
    patientId: string,
  ): Promise<void> {
    if (sourceEncounterId === undefined) {
      return;
    }

    const encounter = await this.admissionReferenceRepository.findLiveEncounter(sourceEncounterId);

    if (!encounter) {
      throw new BadRequestException('Source encounter not found');
    }

    if (encounter.patientId !== patientId) {
      throw new BadRequestException('Source encounter belongs to a different patient');
    }
  }

  /**
   * A readable refusal for the ordinary case. The authority is still the
   * partial unique index — this read can go stale between here and the insert,
   * and that is exactly the race the constraint settles.
   */
  private async assertBedIsFree(bedId: string): Promise<void> {
    const bed = await this.bedService.getBed(bedId);

    if (bed.status !== 'AVAILABLE') {
      throw new ConflictException(`Bed ${bed.code} is ${bed.status.toLowerCase()}`);
    }
  }

  /**
   * A backdated transfer or discharge may not predate the assignment it ends —
   * the CHECK constraint says the same thing, and saying it here turns a
   * database error into a message a clerk can act on.
   */
  private resolveEffectiveAt(rawEffectiveAt: string | undefined, startedAt: Date): Date {
    const effectiveAt = rawEffectiveAt ? new Date(rawEffectiveAt) : new Date();

    if (effectiveAt.getTime() < startedAt.getTime()) {
      throw new BadRequestException('Timestamp predates the current bed assignment');
    }

    return effectiveAt;
  }

  private mapConflict(err: unknown): unknown {
    if (err instanceof AdmissionConflictError) {
      return new ConflictException(err.message);
    }
    return err;
  }
}
