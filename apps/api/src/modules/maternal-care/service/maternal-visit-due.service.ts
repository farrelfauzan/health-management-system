import {
  doesDueWindowOverlapRange,
  FamilyPlanningDueItem,
  getCalendarDateInTimeZone,
  ListMaternalVisitsDueQuery,
  MaternalDueRange,
  MaternalDueReach,
  MaternalDueRecord,
  resolveMaternalDueRange,
  ShkScreeningView,
} from '@hms/shared-types';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { FamilyPlanningService } from './family-planning.service';
import { MaternalCareService } from './maternal-care.service';
import { PostnatalVisitService } from './postnatal-visit.service';
import { ShkScreeningService } from './shk-screening.service';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const CLINIC_WIDE_REACH: MaternalDueReach = { hasAny: true };

/**
 * The due-this-week list across every maternal schedule (P25-T17): trimester
 * visits (P25-T06), KF/KN windows (P25-T12), KB courses (P25-T14) and SHK
 * samples (P25-T10).
 *
 * It owns no due rule. Each source is asked through the service that owns
 * it, under one reach resolved once, and this only gathers and orders what
 * they answer — so a change to when a KF window opens is made in one place
 * and the worklist, the PNC tab and the reminder worker all follow it.
 */
@Injectable()
export class MaternalVisitDueService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly maternalCareService: MaternalCareService,
    private readonly postnatalVisitService: PostnatalVisitService,
    private readonly familyPlanningService: FamilyPlanningService,
    private readonly shkScreeningService: ShkScreeningService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /** The range a request asks for, defaulting to the week starting today on the clinic's clock. */
  resolveRange(query: ListMaternalVisitsDueQuery): MaternalDueRange {
    return resolveMaternalDueRange({ query, clinicToday: this.resolveClinicToday() });
  }

  resolveClinicToday(): string {
    return getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
  }

  /**
   * The worklist a clinician reads. A caller under OWN scope with no
   * clinician profile — a patient — is refused: this is a clinic worklist,
   * and her own visits are on her own record.
   */
  async listDue(range: MaternalDueRange, currentUser: CurrentUser): Promise<MaternalDueRecord[]> {
    const reach = await this.familyPlanningService.resolveDueReach(currentUser);
    if (!reach.hasAny && reach.doctorId === null) {
      throw new ForbiddenException('The maternal due worklist is for clinicians');
    }
    return this.collect(range, reach);
  }

  /** The same list, clinic-wide, for the reminder worker that has no caller. */
  async listDueForReminders(range: MaternalDueRange): Promise<MaternalDueRecord[]> {
    return this.collect(range, CLINIC_WIDE_REACH);
  }

  private async collect(
    range: MaternalDueRange,
    reach: MaternalDueReach,
  ): Promise<MaternalDueRecord[]> {
    const [antenatal, postnatal, familyPlanning, shkSamples] = await Promise.all([
      this.maternalCareService.listAntenatalDueRecords(range, reach),
      this.postnatalVisitService.listPostnatalDueRecords(range, reach),
      this.familyPlanningService.listDueWithinReach({ dueOnOrBefore: range.to, reach }),
      this.shkScreeningService.listUntakenSamplesWithinReach(reach),
    ]);
    return [
      ...antenatal,
      ...postnatal,
      ...familyPlanning.flatMap((item) => toFamilyPlanningDueRecords(item, range)),
      ...shkSamples.flatMap((sample) => this.toShkDueRecords(sample, range)),
    ].sort(compareDueRecords);
  }

  private toShkDueRecords(sample: ShkScreeningView, range: MaternalDueRange): MaternalDueRecord[] {
    const dueFrom = getCalendarDateInTimeZone(new Date(sample.dueFrom), this.clinicTimeZone);
    const dueUntil = getCalendarDateInTimeZone(new Date(sample.dueUntil), this.clinicTimeZone);
    if (!doesDueWindowOverlapRange({ dueFrom, dueUntil, range })) {
      return [];
    }
    return [
      {
        visitKey: `SHK:${sample.id}`,
        source: 'SHK',
        code: `SHK${sample.sequence}`,
        subject: 'NEWBORN',
        patientId: sample.motherPatientId,
        patientName: sample.motherName,
        medicalRecordNumber: null,
        dueFrom,
        dueUntil,
      },
    ];
  }
}

/**
 * A KB course is due on one day. The list it comes from already includes the
 * overdue, so only the lower bound is applied here; the key carries the due
 * date because the same course falls due again after every service.
 */
function toFamilyPlanningDueRecords(
  item: FamilyPlanningDueItem,
  range: MaternalDueRange,
): MaternalDueRecord[] {
  if (item.nextDueOn < range.from) {
    return [];
  }
  return [
    {
      visitKey: `KB:${item.familyPlanningRecordId}:${item.nextDueOn}`,
      source: 'FAMILY_PLANNING',
      code: item.method,
      subject: 'PATIENT',
      patientId: item.patientId,
      patientName: item.patientName,
      medicalRecordNumber: item.medicalRecordNumber,
      dueFrom: item.nextDueOn,
      dueUntil: item.nextDueOn,
    },
  ];
}

/** Soonest first, then by name, so the list reads the same on every load. */
function compareDueRecords(left: MaternalDueRecord, right: MaternalDueRecord): number {
  return (
    left.dueFrom.localeCompare(right.dueFrom) ||
    left.patientName.localeCompare(right.patientName) ||
    left.visitKey.localeCompare(right.visitKey)
  );
}
