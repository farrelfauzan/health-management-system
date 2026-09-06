import {
  ActorScopeResolution,
  canTransitionRegistrationStatus,
  EncounterDetail,
  EncounterListItem,
  EncountersListMeta,
  EncounterSourceRegistrationRecord,
  UpdateEncounterRecordPayload,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { ListEncountersQueryDto } from '../dto/list-encounters-query.dto';
import { OpenEncounterDto } from '../dto/open-encounter.dto';
import { UpdateEncounterSoapDto } from '../dto/update-encounter-soap.dto';
import { EncounterRepository } from '../repository/encounter.repository';
import { EncounterAccessService } from './encounter-access.service';
import { EncounterMapper } from './encounter.mapper';

function parseEncounterDateOnly(value: string): Date {
  const [yearPart = '', monthPart = '', dayPart = ''] = value.split('-');
  return new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, Number(dayPart)));
}

/**
 * The encounter lifecycle: opening the record for a checked-in patient, writing
 * the SOAP note, and closing it. Vitals, diagnoses, and procedures are written
 * through `EncounterClinicalDataService`.
 */
@Injectable()
export class EncounterService {
  private readonly logger = new Logger(EncounterService.name);

  constructor(
    private readonly encounterRepository: EncounterRepository,
    private readonly encounterAccessService: EncounterAccessService,
    private readonly encounterMapper: EncounterMapper,
  ) {}

  async listEncounters(
    query: ListEncountersQueryDto,
    currentUser: CurrentUser,
  ): Promise<{ items: EncounterListItem[]; meta: EncountersListMeta }> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'read');
    const result = await this.encounterRepository.listEncounters({
      page: query.page,
      limit: query.limit,
      status: query.status,
      patientId: query.patientId,
      doctorId: query.doctorId,
      registrationId: query.registrationId,
      startedFrom: query.startedFrom ? parseEncounterDateOnly(query.startedFrom) : undefined,
      startedTo: query.startedTo ? parseEncounterDateOnly(query.startedTo) : undefined,
      ownerUserId: scope.hasAny ? undefined : currentUser.sub,
    });

    return {
      items: result.items.map((encounter) => this.encounterMapper.toEncounterListItem(encounter)),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  async getEncounterById(id: string, currentUser: CurrentUser): Promise<EncounterDetail> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'read');
    const encounter = await this.findEncounterOrThrow(id);
    await this.encounterAccessService.assertCanReadEncounter({ encounter, scope, currentUser });
    const detail = await this.encounterRepository.findEncounterDetailById(id);

    if (!detail) {
      throw new NotFoundException('Encounter not found');
    }

    return this.encounterMapper.toEncounterDetail(detail);
  }

  /**
   * Opens the clinical record for a checked-in registration. The registration
   * is the authorisation to see the patient, so no prior doctor-patient
   * assignment is required — walk-ins are the normal case in an FKTP.
   */
  async openEncounter(
    payload: OpenEncounterDto,
    currentUser: CurrentUser,
  ): Promise<EncounterListItem> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const registration = await this.findRegistrationOrThrow(payload.registrationId);
    this.assertRegistrationReadyForEncounter(registration);
    await this.assertRegistrationHasNoEncounter(registration.id);
    const doctorId = await this.resolveAttendingDoctorId(payload, scope, currentUser);
    const created = await this.encounterRepository.createEncounter({
      registrationId: registration.id,
      patientId: registration.patientId,
      doctorId,
      createdById: currentUser.sub,
    });
    const listItem = this.encounterMapper.toEncounterListItem(created);
    this.warnIfNotReportable(listItem);

    return listItem;
  }

  /**
   * A doctor with no NIK cannot be resolved in the SATUSEHAT master
   * practitioner index, so every encounter they open is unreportable and will
   * settle as permanently FAILED in the outbox (SJ-75). Opening it is still
   * allowed — a registry gap must not stop a consultation — so the record is
   * the warning: it names the doctor an admin has to fix, at the moment the
   * unreportable encounter is created rather than hours later in the queue.
   */
  private warnIfNotReportable(encounter: EncounterListItem): void {
    if (encounter.doctor.satusehatReportable) {
      return;
    }
    this.logger.warn(
      `Encounter ${encounter.id} opened for doctor ${encounter.doctor.id}, who has no NIK on record; it cannot be reported to SATUSEHAT until one is added`,
    );
  }

  async updateEncounterSoap(
    id: string,
    payload: UpdateEncounterSoapDto,
    currentUser: CurrentUser,
  ): Promise<EncounterListItem> {
    const encounter = await this.assertWritableEncounter(id, currentUser);
    const updated = await this.encounterRepository.updateEncounter(
      this.buildSoapUpdatePayload(encounter.id, payload),
    );

    return this.encounterMapper.toEncounterListItem(updated);
  }

  /**
   * Finishes the visit: the encounter becomes FINISHED and its registration
   * COMPLETED in one transaction, which is what moves the patient out of the
   * queue and lets Phase 9 bill the visit.
   */
  async closeEncounter(id: string, currentUser: CurrentUser): Promise<EncounterListItem> {
    return this.transitionEncounter({
      id,
      currentUser,
      status: 'FINISHED',
      registrationStatus: 'COMPLETED',
    });
  }

  /**
   * Retracts a record opened in error. The registration is cancelled with it:
   * one encounter per registration is a hard constraint, so the patient
   * re-registers rather than the record being re-opened.
   */
  async cancelEncounter(id: string, currentUser: CurrentUser): Promise<EncounterListItem> {
    return this.transitionEncounter({
      id,
      currentUser,
      status: 'CANCELLED',
      registrationStatus: 'CANCELLED',
    });
  }

  private async transitionEncounter(params: {
    id: string;
    currentUser: CurrentUser;
    status: 'CANCELLED' | 'FINISHED';
    registrationStatus: 'CANCELLED' | 'COMPLETED';
  }): Promise<EncounterListItem> {
    const { id, currentUser, status, registrationStatus } = params;
    const encounter = await this.assertWritableEncounter(id, currentUser);
    this.encounterAccessService.assertAllowedStatusTransition(encounter.status, status);
    const registration = await this.findRegistrationOrThrow(encounter.registrationId);
    this.assertRegistrationTransition(registration, registrationStatus);
    const closed = await this.encounterRepository.closeEncounter({
      id: encounter.id,
      registrationId: registration.id,
      status,
      registrationStatus,
      endedAt: new Date(),
    });

    return this.encounterMapper.toEncounterListItem(closed);
  }

  private async assertWritableEncounter(id: string, currentUser: CurrentUser) {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const encounter = await this.findEncounterOrThrow(id);
    this.encounterAccessService.assertCanWriteEncounter({ encounter, scope, currentUser });
    this.encounterAccessService.assertEncounterOpen(encounter);
    return encounter;
  }

  private buildSoapUpdatePayload(
    id: string,
    payload: UpdateEncounterSoapDto,
  ): UpdateEncounterRecordPayload {
    return {
      id,
      ...(payload.subjective !== undefined ? { subjective: payload.subjective } : {}),
      ...(payload.objective !== undefined ? { objective: payload.objective } : {}),
      ...(payload.assessment !== undefined ? { assessment: payload.assessment } : {}),
      ...(payload.plan !== undefined ? { plan: payload.plan } : {}),
      ...(payload.prognosis !== undefined ? { prognosis: payload.prognosis } : {}),
    };
  }

  private async resolveAttendingDoctorId(
    payload: OpenEncounterDto,
    scope: ActorScopeResolution,
    currentUser: CurrentUser,
  ): Promise<string> {
    if (!scope.hasAny) {
      const ownDoctor = await this.encounterRepository.findActiveDoctorByOwnerUserId(
        currentUser.sub,
      );

      if (!ownDoctor) {
        throw new ForbiddenException('You do not have an active doctor profile');
      }

      if (payload.doctorId && payload.doctorId !== ownDoctor.id) {
        throw new ForbiddenException('You may only open encounters you attend');
      }

      return ownDoctor.id;
    }

    if (!payload.doctorId) {
      throw new BadRequestException('doctorId is required when opening on behalf of a doctor');
    }

    const doctor = await this.encounterRepository.findActiveDoctorById(payload.doctorId);

    if (!doctor) {
      throw new BadRequestException('Doctor not found or inactive');
    }

    return doctor.id;
  }

  private assertRegistrationReadyForEncounter(
    registration: EncounterSourceRegistrationRecord,
  ): void {
    if (registration.status !== 'CHECKED_IN') {
      throw new ConflictException(
        `Registration in status ${registration.status} can not start an encounter`,
      );
    }

    if (!registration.patient.isActive) {
      throw new BadRequestException('Patient is inactive');
    }
  }

  private async assertRegistrationHasNoEncounter(registrationId: string): Promise<void> {
    const existing = await this.encounterRepository.findEncounterIdByRegistrationId(registrationId);

    if (existing) {
      throw new ConflictException('Registration already has an encounter');
    }
  }

  private assertRegistrationTransition(
    registration: EncounterSourceRegistrationRecord,
    registrationStatus: 'CANCELLED' | 'COMPLETED',
  ): void {
    if (!canTransitionRegistrationStatus(registration.status, registrationStatus)) {
      throw new ConflictException(
        `Registration status can not change from ${registration.status} to ${registrationStatus}`,
      );
    }
  }

  private async findEncounterOrThrow(id: string) {
    const encounter = await this.encounterRepository.findEncounterWithRelationsById(id);

    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }

    return encounter;
  }

  private async findRegistrationOrThrow(
    registrationId: string,
  ): Promise<EncounterSourceRegistrationRecord> {
    const registration =
      await this.encounterRepository.findRegistrationForEncounter(registrationId);

    if (!registration) {
      throw new BadRequestException('Registration not found');
    }

    return registration;
  }
}
