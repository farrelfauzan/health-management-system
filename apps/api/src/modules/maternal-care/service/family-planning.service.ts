import {
  DiscontinueFamilyPlanningInput,
  FAMILY_PLANNING_COURSE_ACTIVE_ERROR_CODE,
  FAMILY_PLANNING_COURSE_DISCONTINUED_ERROR_CODE,
  FAMILY_PLANNING_DATE_BEFORE_START_ERROR_CODE,
  FAMILY_PLANNING_LINK_PATIENT_MISMATCH_ERROR_CODE,
  FamilyPlanningCourseRecord,
  FamilyPlanningCourseView,
  FamilyPlanningDueItem,
  getCalendarDateInTimeZone,
  ListFamilyPlanningDueQueryInput,
  MaternalDueReach,
  PatientFamilyPlanningResponse,
  RecordFamilyPlanningServiceInput,
  resolveFamilyPlanningNextDueDate,
  StartFamilyPlanningInput,
} from '@hms/shared-types';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuditAction } from '../../../generated/prisma/client';
import { EncounterAccessService } from '../../emr/service/encounter-access.service';
import { FamilyPlanningCourseConflictError } from '../repository/family-planning-course-conflict.error';
import { FamilyPlanningRepository } from '../repository/family-planning.repository';
import { toDateOnly } from '../to-date-only';
import { toMaternalDate } from '../to-maternal-date';
import { FamilyPlanningAuthorityService } from './family-planning-authority.service';
import { toFamilyPlanningCourseView } from './to-family-planning-course-view';

const AUDIT_RESOURCE = 'FamilyPlanningRecord';
const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const ONE_DAY_IN_MILLISECONDS = 86_400_000;
/**
 * How long after a birth the KB tab still offers KB pasca salin: the 42-day
 * nifas period, within which Kemenkes' *Pedoman Pelayanan KB Pasca Persalinan*
 * places postpartum contraception.
 */
const POST_DELIVERY_WINDOW_DAYS = 42;

/**
 * The family planning (KB) course (P25-T14): started with a method and an
 * acceptor type, followed up by services that move its next due date, and
 * ended by a discontinuation.
 *
 * Access is the **encounter's**, like the pregnancy episode (P25-T06): KB is
 * clinical work on the patient, so `Encounter` `read`/`write` and the
 * patient-level reach `EncounterAccessService` answers decide who may. No
 * permission key is seeded.
 */
@Injectable()
export class FamilyPlanningService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly familyPlanningRepository: FamilyPlanningRepository,
    private readonly familyPlanningAuthorityService: FamilyPlanningAuthorityService,
    private readonly encounterAccessService: EncounterAccessService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /** The KB tab: the live course, every course, and a pasca salin prompt. */
  async getPatientFamilyPlanning(
    patientId: string,
    currentUser: CurrentUser,
  ): Promise<PatientFamilyPlanningResponse> {
    await this.assertCanReachPatient(patientId, currentUser, 'read');
    const courses = await this.familyPlanningRepository.listCoursesByPatientId(patientId);
    const views = courses.map((course) => toFamilyPlanningCourseView(course));
    const liveCourse = views.find((course) => course.isLive) ?? null;
    const candidate =
      liveCourse === null
        ? await this.familyPlanningRepository.findPostDeliveryCandidate({
            patientId,
            bornOnOrAfter: this.addDays(this.resolveClinicToday(), -POST_DELIVERY_WINDOW_DAYS),
          })
        : null;

    return {
      liveCourse,
      courses: views,
      postDeliveryCandidate:
        candidate === null
          ? null
          : { deliveryRecordId: candidate.id, birthAt: candidate.birthAt.toISOString() },
    };
  }

  async startCourse(
    patientId: string,
    payload: StartFamilyPlanningInput,
    currentUser: CurrentUser,
  ): Promise<FamilyPlanningCourseView> {
    await this.assertCanReachPatient(patientId, currentUser, 'write');
    await this.assertEncounterBelongsToPatient(payload.startEncounterId, patientId);
    await this.assertDeliveryBelongsToPatient(payload.deliveryRecordId, patientId);
    const nextDueOn = resolveFamilyPlanningNextDueDate({
      method: payload.method,
      servedOn: payload.startedOn,
      enteredNextDueOn: payload.nextDueOn,
    });
    this.assertNotBeforeStart(nextDueOn, payload.startedOn, 'nextDueOn');
    const mandateId = await this.familyPlanningAuthorityService.resolveMethodMandate({
      method: payload.method,
      providerDoctorId: payload.providerDoctorId,
      startedOn: payload.startedOn,
      patientId,
      actorUserId: currentUser.sub,
    });
    const course = await this.createCourseOrConflict({ patientId, payload, nextDueOn, mandateId });
    await this.recordAudit(AuditAction.FAMILY_PLANNING_STARTED, course, currentUser, {
      method: course.method,
      acceptorType: course.acceptorType,
      postDelivery: course.deliveryRecordId !== null,
      ...(mandateId === null ? {} : { mandateId }),
    });

    return toFamilyPlanningCourseView(course);
  }

  /** A follow-up of a live course; its due date becomes the course's. */
  async recordService(
    id: string,
    payload: RecordFamilyPlanningServiceInput,
    currentUser: CurrentUser,
  ): Promise<FamilyPlanningCourseView> {
    const course = await this.getLiveCourseOrThrow(id, currentUser);
    await this.assertEncounterBelongsToPatient(payload.encounterId, course.patientId);
    const startedOn = toDateOnly(course.startedOn);
    this.assertNotBeforeStart(payload.servedOn, startedOn, 'servedOn');
    const nextDueOn = resolveFamilyPlanningNextDueDate({
      method: course.method,
      servedOn: payload.servedOn,
      enteredNextDueOn: payload.nextDueOn,
    });
    this.assertNotBeforeStart(nextDueOn, startedOn, 'nextDueOn');
    const updated = await this.familyPlanningRepository.createService({
      familyPlanningRecordId: id,
      encounterId: payload.encounterId ?? null,
      servedOn: toMaternalDate(payload.servedOn) as Date,
      action: payload.action,
      nextDueOn: toMaternalDate(nextDueOn),
      sideEffects: payload.sideEffects ?? null,
    });

    return toFamilyPlanningCourseView(updated);
  }

  async discontinueCourse(
    id: string,
    payload: DiscontinueFamilyPlanningInput,
    currentUser: CurrentUser,
  ): Promise<FamilyPlanningCourseView> {
    const course = await this.getLiveCourseOrThrow(id, currentUser);
    this.assertNotBeforeStart(payload.discontinuedOn, toDateOnly(course.startedOn), 'discontinuedOn');
    const discontinued = await this.familyPlanningRepository.discontinueCourse({
      id,
      discontinuedOn: toMaternalDate(payload.discontinuedOn) as Date,
      reason: payload.reason,
    });
    await this.recordAudit(AuditAction.FAMILY_PLANNING_DISCONTINUED, discontinued, currentUser, {
      method: discontinued.method,
      reason: payload.reason,
    });

    return toFamilyPlanningCourseView(discontinued);
  }

  /**
   * Live courses whose next due date is within `withinDays` of the clinic's
   * today, or already past it — an injectable that lapsed last week is the
   * one the list exists for.
   */
  async listDue(
    query: ListFamilyPlanningDueQueryInput,
    currentUser: CurrentUser,
  ): Promise<FamilyPlanningDueItem[]> {
    const reach = await this.resolveDueReach(currentUser);
    const today = this.resolveClinicToday();
    return this.listDueWithinReach({
      dueOnOrBefore: toDateOnly(this.addDays(today, query.withinDays)),
      reach,
    });
  }

  /**
   * The same due list under an already-resolved reach, up to a date
   * (P25-T17): the due-this-week worklist asks with the caller's reach, and
   * the reminder worker with the clinic-wide one it runs under.
   */
  async listDueWithinReach(params: {
    dueOnOrBefore: string;
    reach: MaternalDueReach;
  }): Promise<FamilyPlanningDueItem[]> {
    const today = this.resolveClinicToday();
    const rows = await this.familyPlanningRepository.listDue({
      dueOnOrBefore: toMaternalDate(params.dueOnOrBefore) as Date,
      scope: params.reach,
    });
    return rows.map((row) => ({
      familyPlanningRecordId: row.id,
      patientId: row.patientId,
      patientName: row.patient.fullName,
      medicalRecordNumber: row.patient.mrn,
      method: row.method,
      nextDueOn: toDateOnly(row.nextDueOn),
      daysUntilDue: Math.round((row.nextDueOn.getTime() - today.getTime()) / ONE_DAY_IN_MILLISECONDS),
    }));
  }

  /**
   * Whose due rows the caller may see: ANY scope reaches every patient; OWN
   * the patient herself, the courses the caller provides and the patients
   * assigned to her. Shared by the maternal due worklist (P25-T17) so every
   * source there is filtered by one reach rule.
   */
  async resolveDueReach(currentUser: CurrentUser): Promise<MaternalDueReach> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'read');
    if (scope.hasAny) {
      return { hasAny: true };
    }
    return {
      hasAny: false,
      ownerUserId: currentUser.sub,
      doctorId: await this.familyPlanningRepository.findActiveDoctorIdByOwnerUserId(currentUser.sub),
    };
  }

  private async createCourseOrConflict(params: {
    patientId: string;
    payload: StartFamilyPlanningInput;
    nextDueOn: string | null;
    mandateId: string | null;
  }): Promise<FamilyPlanningCourseRecord> {
    const { payload } = params;
    try {
      return await this.familyPlanningRepository.createCourse({
        patientId: params.patientId,
        method: payload.method,
        acceptorType: payload.acceptorType,
        startedOn: toMaternalDate(payload.startedOn) as Date,
        providerDoctorId: payload.providerDoctorId,
        startEncounterId: payload.startEncounterId ?? null,
        deliveryRecordId: payload.deliveryRecordId ?? null,
        mandateId: params.mandateId,
        nextDueOn: toMaternalDate(params.nextDueOn),
        sideEffects: payload.sideEffects ?? null,
      });
    } catch (caughtError: unknown) {
      if (caughtError instanceof FamilyPlanningCourseConflictError) {
        throw new ConflictException({
          code: FAMILY_PLANNING_COURSE_ACTIVE_ERROR_CODE,
          message: 'This patient already has a live family planning course; discontinue it first',
        });
      }
      throw caughtError;
    }
  }

  private async getLiveCourseOrThrow(
    id: string,
    currentUser: CurrentUser,
  ): Promise<FamilyPlanningCourseRecord> {
    await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const course = await this.familyPlanningRepository.findCourseById(id);
    if (course === null) {
      throw new NotFoundException('Family planning course not found');
    }
    await this.assertCanReachPatient(course.patientId, currentUser, 'write');
    if (course.discontinuedOn !== null) {
      throw new ConflictException({
        code: FAMILY_PLANNING_COURSE_DISCONTINUED_ERROR_CODE,
        message: 'This family planning course was discontinued and can no longer be changed',
      });
    }
    return course;
  }

  /**
   * ANY scope reaches every patient. Under OWN, reach is the pregnancy
   * episode's (P25-T06): the patient herself for reads, and a clinician with
   * an active assignment to her.
   */
  private async assertCanReachPatient(
    patientId: string,
    currentUser: CurrentUser,
    action: 'read' | 'write',
  ): Promise<void> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, action);
    const patient = await this.familyPlanningRepository.findPatient(patientId);
    if (patient === null) {
      throw new NotFoundException('Patient not found');
    }
    if (scope.hasAny || (action === 'read' && patient.ownerUserId === currentUser.sub)) {
      return;
    }
    const assignment = await this.encounterAccessService.findActiveAssignmentForCaller(
      patientId,
      currentUser,
    );
    if (assignment === null) {
      throw new ForbiddenException(`You are not allowed to ${action} this family planning record`);
    }
  }

  private async assertEncounterBelongsToPatient(
    encounterId: string | null | undefined,
    patientId: string,
  ): Promise<void> {
    if (encounterId === null || encounterId === undefined) {
      return;
    }
    const encounter = await this.familyPlanningRepository.findEncounterLink(encounterId);
    if (encounter === null) {
      throw new NotFoundException('Encounter not found');
    }
    this.assertLinkMatches(encounter.patientId, patientId, 'encounterId');
  }

  private async assertDeliveryBelongsToPatient(
    deliveryRecordId: string | null | undefined,
    patientId: string,
  ): Promise<void> {
    if (deliveryRecordId === null || deliveryRecordId === undefined) {
      return;
    }
    const delivery = await this.familyPlanningRepository.findDeliveryLink(deliveryRecordId);
    if (delivery === null) {
      throw new NotFoundException('Delivery record not found');
    }
    this.assertLinkMatches(delivery.patientId, patientId, 'deliveryRecordId');
  }

  private assertLinkMatches(linkedPatientId: string, patientId: string, field: string): void {
    if (linkedPatientId === patientId) {
      return;
    }
    throw new UnprocessableEntityException({
      code: FAMILY_PLANNING_LINK_PATIENT_MISMATCH_ERROR_CODE,
      message: 'The linked record belongs to another patient',
      errors: { [field]: 'belongs to another patient' },
    });
  }

  /** `YYYY-MM-DD` strings compare correctly as strings. */
  private assertNotBeforeStart(value: string | null, startedOn: string, field: string): void {
    if (value === null || value >= startedOn) {
      return;
    }
    throw new UnprocessableEntityException({
      code: FAMILY_PLANNING_DATE_BEFORE_START_ERROR_CODE,
      message: 'A family planning date cannot fall before the course started',
      errors: { [field]: `must be on or after ${startedOn}` },
    });
  }

  private async recordAudit(
    action: AuditAction,
    course: FamilyPlanningCourseRecord,
    currentUser: CurrentUser,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.record({
      action,
      resource: AUDIT_RESOURCE,
      resourceId: course.id,
      actorUserId: currentUser.sub,
      patientId: course.patientId,
      metadata,
    });
  }

  private resolveClinicToday(): Date {
    return new Date(`${getCalendarDateInTimeZone(new Date(), this.clinicTimeZone)}T00:00:00.000Z`);
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * ONE_DAY_IN_MILLISECONDS);
  }
}
