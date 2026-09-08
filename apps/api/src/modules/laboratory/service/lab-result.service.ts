import {
  AmendLabResultInput,
  EnterLabResultsInput,
  LabOrderBenchView,
  LabOrderRecord,
  LabOrderResultsView,
  LabResultEntryInput,
  LabResultEntryPayload,
  LabResultFlagValue,
  LabResultPatientContext,
  LabResultRangeSnapshot,
  LabResultRecord,
  LabResultView,
  ListPatientLabResultsQuery,
  PatientLabResultView,
  computeLabFlag,
  getStartOfCalendarDateInTimeZone,
  resolveLabReferenceRange,
} from '@hms/shared-types';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { NotificationService } from '../../notification/service/notification.service';
import { LabOrderRepository } from '../repository/lab-order.repository';
import { LabResultEntryItemRow } from '../repository/lab-result-row.types';
import { LabResultRepository } from '../repository/lab-result.repository';
import { LabOrderMapper } from './lab-order.mapper';
import { LabReportService } from './lab-report.service';
import { LabResultMapper } from './lab-result.mapper';
import { LaboratorySettingsService } from './laboratory-settings.service';
import { toLabWorklistPatient } from './to-lab-worklist-patient';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

const DAY_IN_MILLISECONDS = 86_400_000;

const DEFAULT_TREND_LIMIT = 20;

/**
 * The role *codes* whose signature releases a report on its own merit.
 *
 * Codes, not names: `Role.name` is the human label a clinic may rename
 * ("Dokter"), while `code` is the stable identifier the JWT and every other
 * role check in this codebase use.
 */
const VERIFIER_ROLE_CODES = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR'] as const;

const LAB_TECHNICIAN_ROLE_CODE = 'LAB_TECHNICIAN';

/** Values may be typed once a tube exists and until the order is signed out. */
const ENTRY_STATUSES = ['COLLECTED', 'IN_PROGRESS', 'RESULTED'] as const;

const DOCTOR_ENCOUNTER_PATH_PREFIX = '/doctor/encounters/';
/** Where a released order with no ordering doctor is read instead (P18-T10). */
const ADMIN_LAB_ORDER_PATH_PREFIX = '/admin/laboratory/';
/**
 * ADMIN-only by P18-T02's grant table, which is what makes it the right
 * audience for a result nobody at this clinic asked for: `lab-order.read:any`
 * would also reach the technicians who released it.
 */
const LAB_ORDER_WRITE_ANY_PERMISSION = 'lab-order.write:any';

/**
 * The clinically important part of the laboratory: the value, whether it is
 * abnormal, and the second signature that stands between a typo and a
 * diagnosis (P18-T04).
 *
 * Three rules carry most of the weight here, and each exists because of a way
 * a lab result goes wrong in the real world:
 *
 * - The reference band is **snapshotted at entry**, so a range edited next year
 *   never re-flags a result measured this year. A flag records what was
 *   abnormal by the standard in force when the blood was in the tube.
 * - A **critical value notifies the ordering doctor on entry**, before anybody
 *   has verified it. A haemoglobin of 6.8 is telephoned, and telephoning it
 *   does not wait for a second person to be free.
 * - An **amendment is a new version**, never an overwrite. Somebody may have
 *   treated a patient on the strength of the value being corrected, and the
 *   record has to be able to show them what they saw.
 */
@Injectable()
export class LabResultService {
  private readonly logger = new Logger(LabResultService.name);

  private readonly clinicTimeZone: string;

  constructor(
    private readonly labResultRepository: LabResultRepository,
    private readonly labOrderRepository: LabOrderRepository,
    private readonly laboratorySettingsService: LaboratorySettingsService,
    private readonly labResultMapper: LabResultMapper,
    private readonly labOrderMapper: LabOrderMapper,
    private readonly authRepository: AuthRepository,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly labReportService: LabReportService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /**
   * Types a worksheet's values against one order. A batch because that is how
   * an analis works — down a rack, saving the order rather than each number —
   * and because two of them saving at once must lose no rows: entry writes
   * version 1 per item, so the later save re-states its own items and leaves
   * everybody else's alone.
   */
  async enterLabResults(
    labOrderId: string,
    payload: EnterLabResultsInput,
    currentUser: CurrentUser,
  ): Promise<LabOrderResultsView> {
    const order = await this.findLabOrderOrThrow(labOrderId);
    this.assertEntryAllowed(order);
    const items = await this.labResultRepository.findEntryItemsByOrderId(order.id);
    const patient = await this.resolvePatientContext(order);
    const entries = payload.items.map((entry) =>
      this.toEntryPayload(entry, this.findItemOrThrow(items, entry.labOrderItemId), patient),
    );
    const written = await this.labResultRepository.enterLabResults({
      labOrderId: order.id,
      enteredById: currentUser.sub,
      enteredAt: new Date(),
      entries,
    });
    await this.auditService.record({
      action: 'LAB_RESULT_ENTERED',
      resource: 'LabResult',
      resourceId: order.id,
      actorUserId: currentUser.sub,
      patientId: order.patientId,
      metadata: {
        orderNumber: order.orderNumber,
        itemCount: written.length,
        flags: written.map((result) => result.flag ?? 'NONE'),
      },
    });
    await this.notifyCriticalValues(order, written, currentUser);

    return this.toOrderResultsView(order.id);
  }

  /**
   * The second signature. Releases the order whole — a report is signed out as
   * one document — and refuses while any test is still waiting, because a
   * report that omits what it was asked for is not a finished report.
   */
  async releaseLabOrder(
    labOrderId: string,
    currentUser: CurrentUser,
  ): Promise<LabOrderResultsView> {
    const order = await this.findLabOrderOrThrow(labOrderId);
    this.assertReleasable(order);
    const results = await this.labResultRepository.findResultsByOrderId(order.id);
    const settings = await this.laboratorySettingsService.getLaboratorySettings();
    await this.assertMayVerify(currentUser, settings.technicianMayVerify);
    this.assertTwoOperators(results, currentUser, settings.singleOperator);
    const released = await this.labResultRepository.releaseLabOrder({
      labOrderId: order.id,
      verifiedById: currentUser.sub,
      verifiedAt: new Date(),
      verifiedUnderSingleOperator: settings.singleOperator,
    });
    await this.auditService.record({
      action: 'LAB_RESULT_RELEASED',
      resource: 'LabResult',
      resourceId: order.id,
      actorUserId: currentUser.sub,
      patientId: order.patientId,
      metadata: {
        orderNumber: order.orderNumber,
        verifiedById: currentUser.sub,
        enteredByIds: [...new Set(released.map((result) => result.enteredById))],
        singleOperator: settings.singleOperator,
      },
    });
    await this.notifyRelease(order, currentUser);
    await this.enqueueReport(order.id, currentUser, false);

    return this.toOrderResultsView(order.id);
  }

  /**
   * Corrects a released value by writing the next version beside it. The
   * superseded row stays readable for ever, and the order is released again
   * with a new timestamp so every consumer re-reads the corrected report.
   *
   * An amendment is entered and verified by the same person by construction —
   * the corrector types the number and stands behind it — and the row records
   * that. Requiring a second signature here would leave a value known to be
   * wrong standing in the record while somebody was found to countersign it,
   * which is the worse of the two failures.
   */
  async amendLabResult(
    resultId: string,
    payload: AmendLabResultInput,
    currentUser: CurrentUser,
  ): Promise<LabResultView> {
    const previous = await this.findLabResultOrThrow(resultId);
    const location = await this.findResultLocationOrThrow(resultId);
    const order = await this.findLabOrderOrThrow(location.labOrderId);
    this.assertAmendable(order, previous);
    const settings = await this.laboratorySettingsService.getLaboratorySettings();
    await this.assertMayVerify(currentUser, settings.technicianMayVerify);
    const items = await this.labResultRepository.findEntryItemsByOrderId(order.id);
    const item = this.findItemOrThrow(items, location.labOrderItemId);
    const latestVersion = await this.labResultRepository.findLatestVersionForItem(
      location.labOrderItemId,
    );
    this.assertIsCurrentVersion(previous, latestVersion);
    const snapshot = this.toCarriedForwardSnapshot(previous);
    const value = this.assertValueShape(payload, item);
    const now = new Date();
    const amended = await this.labResultRepository.amendLabResult({
      ...snapshot,
      amendedFromId: previous.id,
      labOrderId: order.id,
      labOrderItemId: location.labOrderItemId,
      version: latestVersion + 1,
      ...value,
      unit: item.labTest.unit,
      flag: computeLabFlag({ resultType: item.labTest.resultType, ...value, range: snapshot }),
      amendReason: payload.reason,
      enteredById: currentUser.sub,
      enteredAt: now,
      verifiedById: currentUser.sub,
      verifiedAt: now,
      verifiedUnderSingleOperator: true,
    });
    await this.auditService.record({
      action: 'LAB_RESULT_AMENDED',
      resource: 'LabResult',
      resourceId: amended.id,
      actorUserId: currentUser.sub,
      patientId: order.patientId,
      metadata: {
        orderNumber: order.orderNumber,
        supersededResultId: previous.id,
        fromVersion: previous.version,
        toVersion: amended.version,
        reason: payload.reason,
      },
    });
    await this.notifyAmendment(order, amended, currentUser);
    await this.enqueueReport(order.id, currentUser, true);

    return this.labResultMapper.toLabResultView(amended);
  }

  /**
   * P18-T05: the sheet is rendered *after* the signature, by a worker, so
   * signing out never waits on the PDF sidecar. Queued against the order's
   * release time as it now stands — an amendment re-releases the order — and
   * best-effort like the bell: a queue write that failed does not un-sign a
   * report.
   */
  private async enqueueReport(
    labOrderId: string,
    currentUser: CurrentUser,
    isAmended: boolean,
  ): Promise<void> {
    const order = await this.findLabOrderOrThrow(labOrderId);
    await this.labReportService.enqueueForOrder({
      labOrderId,
      requestedById: currentUser.sub,
      isAmended,
      releasedAt: order.releasedAt ?? new Date(),
    });
  }

  /**
   * One order as the bench works it (P18-T08): every value typed so far,
   * released or not, with the identity the entry form previews a flag
   * against. Read under the same rule as the patient's trend — whoever may
   * read this patient's orders may read what is being typed on them.
   */
  async getOrderBench(labOrderId: string, currentUser: CurrentUser): Promise<LabOrderBenchView> {
    const order = await this.findLabOrderOrThrow(labOrderId);
    await this.assertCanReadPatientResults(order.patientId, currentUser);
    const worklistOrder = await this.labOrderRepository.findWorklistOrderById(order.id);
    if (!worklistOrder) {
      throw new NotFoundException('Lab order not found');
    }
    const results = await this.labResultRepository.findResultsByOrderId(order.id);

    return {
      order: this.labOrderMapper.toLabOrderView(order),
      patient: toLabWorklistPatient(worklistOrder),
      results: results.map((result) => this.labResultMapper.toLabResultView(result)),
    };
  }

  /**
   * A patient's released values for one test, newest first — what the doctor's
   * trend is drawn from. Superseded versions are left out: a corrected value is
   * not a second data point, it is a replacement for the first.
   */
  async listPatientLabResults(
    patientId: string,
    query: ListPatientLabResultsQuery,
    currentUser: CurrentUser,
  ): Promise<PatientLabResultView[]> {
    await this.assertCanReadPatientResults(patientId, currentUser);
    const records = await this.labResultRepository.listPatientLabResults({
      patientId,
      testCode: query.testCode,
      from: query.from ? this.toClinicDayStart(query.from) : undefined,
      to: query.to
        ? new Date(this.toClinicDayStart(query.to).getTime() + DAY_IN_MILLISECONDS)
        : undefined,
      limit: query.limit ?? DEFAULT_TREND_LIMIT,
    });

    return records.map((record) => this.labResultMapper.toPatientLabResultView(record));
  }

  /**
   * Released values on one visit, for the encounter record (P18-T04). The EMR
   * module asks the module that owns results rather than reading its tables,
   * exactly as it does for orders.
   */
  async findReleasedResultsForEncounter(encounterId: string): Promise<PatientLabResultView[]> {
    const records = await this.labResultRepository.listEncounterLabResults(encounterId);

    return records.map((record) => this.labResultMapper.toPatientLabResultView(record));
  }

  private async toOrderResultsView(labOrderId: string): Promise<LabOrderResultsView> {
    const order = await this.findLabOrderOrThrow(labOrderId);
    const results = await this.labResultRepository.findResultsByOrderId(labOrderId);

    return {
      order: this.labOrderMapper.toLabOrderView(order),
      results: results.map((result) => this.labResultMapper.toLabResultView(result)),
    };
  }

  /**
   * Resolves the band, computes the flag, and snapshots both onto the row.
   * Nothing downstream re-reads the catalog — that is the whole point of doing
   * it here.
   */
  private toEntryPayload(
    entry: LabResultEntryInput,
    item: LabResultEntryItemRow,
    patient: LabResultPatientContext,
  ): LabResultEntryPayload {
    const value = this.assertValueShape(entry, item);
    const range = resolveLabReferenceRange(
      item.labTest.referenceRanges.map((row) => ({
        id: row.id,
        sex: row.sex,
        ageMinDays: row.ageMinDays,
        ageMaxDays: row.ageMaxDays,
        low: row.low === null ? null : row.low.toNumber(),
        high: row.high === null ? null : row.high.toNumber(),
        criticalLow: row.criticalLow === null ? null : row.criticalLow.toNumber(),
        criticalHigh: row.criticalHigh === null ? null : row.criticalHigh.toNumber(),
        textNormal: row.textNormal,
      })),
      patient,
    );

    return {
      labOrderItemId: entry.labOrderItemId,
      ...value,
      unit: item.labTest.unit,
      refLow: range?.refLow ?? null,
      refHigh: range?.refHigh ?? null,
      refCriticalLow: range?.refCriticalLow ?? null,
      refCriticalHigh: range?.refCriticalHigh ?? null,
      refText: range?.refText ?? null,
      flag: computeLabFlag({
        resultType: item.labTest.resultType,
        ...value,
        range,
      }),
    };
  }

  /**
   * A number typed into a positif/negatif test is not a result, it is a
   * mistake — and one stored in the wrong column can never be compared or
   * trended. 422 rather than 409: the payload is wrong, not the state.
   */
  private assertValueShape(
    input: { valueNumeric?: number | null; valueText?: string | null; valueCoded?: string | null },
    item: LabResultEntryItemRow,
  ): { valueNumeric: number | null; valueText: string | null; valueCoded: string | null } {
    const value = {
      valueNumeric: input.valueNumeric ?? null,
      valueText: input.valueText ?? null,
      valueCoded: input.valueCoded ?? null,
    };
    const expected = {
      NUMERIC: value.valueNumeric !== null,
      TEXT: value.valueText !== null,
      CODED: value.valueCoded !== null,
    }[item.labTest.resultType];
    if (!expected) {
      throw new UnprocessableEntityException(
        `${item.labTest.name} takes a ${item.labTest.resultType.toLowerCase()} result`,
      );
    }
    if (
      item.labTest.resultType === 'CODED' &&
      value.valueCoded !== null &&
      !item.labTest.codedOptions.includes(value.valueCoded)
    ) {
      throw new UnprocessableEntityException(
        `${value.valueCoded} is not one of the values ${item.labTest.name} can take`,
      );
    }

    return value;
  }

  /** The band an amendment is judged by: the original's, carried forward. */
  private toCarriedForwardSnapshot(previous: LabResultRecord): LabResultRangeSnapshot {
    return {
      refLow: previous.refLow,
      refHigh: previous.refHigh,
      refCriticalLow: previous.refCriticalLow,
      refCriticalHigh: previous.refCriticalHigh,
      refText: previous.refText,
    };
  }

  /**
   * Sex, and age **at collection** rather than today: a sample drawn from a
   * three-week-old and typed a fortnight later is judged against the neonatal
   * band, because that is who the patient was when the blood was taken.
   */
  private async resolvePatientContext(order: LabOrderRecord): Promise<LabResultPatientContext> {
    const worklistOrder = await this.labOrderRepository.findWorklistOrderById(order.id);
    if (!worklistOrder) {
      throw new NotFoundException('Lab order not found');
    }
    const collectedAt = worklistOrder.specimens
      .filter((specimen) => specimen.status !== 'REJECTED')
      .map((specimen) => specimen.collectedAt)
      .sort((left, right) => left.getTime() - right.getTime())[0];

    return {
      sex: worklistOrder.patient.sex,
      ageDaysAtCollection: collectedAt
        ? Math.floor(
            (collectedAt.getTime() - worklistOrder.patient.dateOfBirth.getTime()) /
              DAY_IN_MILLISECONDS,
          )
        : null,
    };
  }

  private findItemOrThrow(
    items: LabResultEntryItemRow[],
    labOrderItemId: string,
  ): LabResultEntryItemRow {
    const item = items.find((candidate) => candidate.id === labOrderItemId);
    if (!item) {
      throw new NotFoundException('Lab order item not found on this order');
    }
    if (item.status === 'CANCELLED') {
      throw new ConflictException('That test was cancelled and takes no result');
    }

    return item;
  }

  private assertEntryAllowed(order: LabOrderRecord): void {
    if (order.fulfilmentSite === 'EXTERNAL') {
      throw new ConflictException(
        `Lab order ${order.orderNumber} is being run by ${order.externalFacilityName ?? 'another facility'}; its results are not entered here`,
      );
    }
    if (order.status === 'RELEASED') {
      throw new ConflictException(
        `Lab order ${order.orderNumber} is already released; a released value is corrected by amending it`,
      );
    }
    if (!ENTRY_STATUSES.some((status) => status === order.status)) {
      throw new ConflictException(
        `Lab order ${order.orderNumber} is ${order.status}; no result can be entered against it`,
      );
    }
  }

  private assertReleasable(order: LabOrderRecord): void {
    if (order.status === 'RELEASED') {
      throw new ConflictException(`Lab order ${order.orderNumber} is already released`);
    }
    const pending = order.items.filter((item) => item.status === 'PENDING');
    if (pending.length > 0) {
      throw new ConflictException(
        `${pending.length} test(s) on ${order.orderNumber} are still waiting for a result`,
      );
    }
    if (order.status !== 'RESULTED') {
      throw new ConflictException(
        `Lab order ${order.orderNumber} is ${order.status}; nothing on it can be released`,
      );
    }
  }

  private assertAmendable(order: LabOrderRecord, previous: LabResultRecord): void {
    if (order.status !== 'RELEASED') {
      throw new ConflictException(
        'Only a released value is amended; an unreleased one is corrected by entering it again',
      );
    }
    if (previous.verifiedAt === null) {
      throw new ConflictException('That value has not been released and cannot be amended');
    }
  }

  /**
   * Corrections chain forward from the current value. Amending a superseded
   * version would fork the history of one measurement into two, and a reader
   * could no longer say which number the record actually holds.
   */
  private assertIsCurrentVersion(previous: LabResultRecord, latestVersion: number): void {
    if (previous.version !== latestVersion) {
      throw new ConflictException(
        `That value has already been amended; correct version ${latestVersion} instead`,
      );
    }
  }

  /**
   * `lab-result.verify:any` is seeded to every role that may hold the pen —
   * including LAB_TECHNICIAN, because a permission granted by seed cannot
   * depend on a runtime setting. The setting is enforced here instead: a
   * technician signs a report out only in a clinic that has said they may.
   * Somebody who is both a technician and a doctor verifies as a doctor.
   */
  private async assertMayVerify(
    currentUser: CurrentUser,
    isTechnicianAllowed: boolean,
  ): Promise<void> {
    if (isTechnicianAllowed) {
      return;
    }
    const actor = await this.authRepository.findUserById(currentUser.sub);
    const roleCodes = (actor?.roles ?? []).map((userRole) => userRole.role.code);
    const isVerifierRole = roleCodes.some((code) =>
      VERIFIER_ROLE_CODES.some((verifier) => verifier === code),
    );
    if (!isVerifierRole && roleCodes.includes(LAB_TECHNICIAN_ROLE_CODE)) {
      throw new ForbiddenException(
        'This clinic requires a doctor or an administrator to release laboratory results',
      );
    }
  }

  /**
   * Two pairs of eyes, unless the clinic has said there is only one pair to be
   * had. The refusal names the rule rather than the person, because the fix is
   * to fetch a colleague, not to argue with the software.
   */
  private assertTwoOperators(
    results: LabResultRecord[],
    currentUser: CurrentUser,
    isSingleOperatorAllowed: boolean,
  ): void {
    if (isSingleOperatorAllowed) {
      return;
    }
    const isOwnEntry = results.some((result) => result.enteredById === currentUser.sub);
    if (isOwnEntry) {
      throw new ForbiddenException(
        'A result is verified by somebody other than the person who entered it',
      );
    }
  }

  /**
   * The patient-wide trend is read by whoever may read the patient's orders.
   * Under OWN scope that is the patient themselves, or a doctor who attends
   * them — holding `lab-order.read:own` and no encounter with this person is
   * not a way into their history.
   */
  private async assertCanReadPatientResults(
    patientId: string,
    currentUser: CurrentUser,
  ): Promise<void> {
    const actor = await this.authRepository.findUserById(currentUser.sub);
    const permissions = (actor?.roles ?? []).flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => rolePermission.permission),
    );
    const matches = permissions.filter(
      (permission) => permission.resource === 'LabOrder' && permission.action === 'read',
    );
    if (matches.some((permission) => permission.scope === 'ANY')) {
      return;
    }
    const isAttending = await this.labResultRepository.hasEncounterWithPatient(
      currentUser.sub,
      patientId,
    );
    if (isAttending) {
      return;
    }
    const isOwnRecord = await this.labResultRepository.isPatientOwner(currentUser.sub, patientId);
    if (!isOwnRecord) {
      throw new ForbiddenException('You are not allowed to read this patient’s laboratory results');
    }
  }

  /**
   * FR: a critical value reaches the ordering doctor **on entry**, before
   * anybody has verified it. Best-effort like every notification producer here
   * — a failed bell must never undo a value that has been measured — and it
   * carries the test, never the number: a feed row is read on a shared
   * terminal.
   */
  private async notifyCriticalValues(
    order: LabOrderRecord,
    results: LabResultRecord[],
    currentUser: CurrentUser,
  ): Promise<void> {
    const critical = results.filter((result) => this.isCriticalFlag(result.flag));
    if (critical.length === 0) {
      return;
    }
    await this.notifyOrderingDoctor(order, currentUser, {
      type: 'LAB_RESULT_CRITICAL',
      titleKey: 'labResultCritical.title',
      bodyKey: 'labResultCritical.body',
      params: {
        orderNumber: order.orderNumber,
        testCount: String(critical.length),
      },
    });
  }

  private async notifyRelease(order: LabOrderRecord, currentUser: CurrentUser): Promise<void> {
    await this.notifyOrderingDoctor(order, currentUser, {
      type: 'LAB_RESULT_RELEASED',
      titleKey: 'labResultReleased.title',
      bodyKey: 'labResultReleased.body',
      params: { orderNumber: order.orderNumber },
    });
  }

  private async notifyAmendment(
    order: LabOrderRecord,
    amended: LabResultRecord,
    currentUser: CurrentUser,
  ): Promise<void> {
    const isCritical = this.isCriticalFlag(amended.flag);
    await this.notifyOrderingDoctor(order, currentUser, {
      type: isCritical ? 'LAB_RESULT_CRITICAL' : 'LAB_RESULT_RELEASED',
      titleKey: isCritical ? 'labResultCritical.title' : 'labResultAmended.title',
      bodyKey: isCritical ? 'labResultCritical.body' : 'labResultAmended.body',
      params: { orderNumber: order.orderNumber, testCount: '1' },
    });
  }

  private async notifyOrderingDoctor(
    order: LabOrderRecord,
    currentUser: CurrentUser,
    message: {
      type: 'LAB_RESULT_CRITICAL' | 'LAB_RESULT_RELEASED';
      titleKey: string;
      bodyKey: string;
      params: Record<string, string>;
    },
  ): Promise<void> {
    try {
      const doctorUserId = await this.labResultRepository.findOrderingDoctorUserId(order.id);
      const href =
        order.encounterId === null
          ? `${ADMIN_LAB_ORDER_PATH_PREFIX}${order.id}`
          : `${DOCTOR_ENCOUNTER_PATH_PREFIX}${order.encounterId}`;
      // A walk-in or an outside referral has no ordering doctor to tell
      // (P18-T10), so the result goes to the desk that raised it instead of
      // going nowhere. Still a notification, because somebody has to hand the
      // sheet to the patient — and for a critical value, act on it today.
      if (doctorUserId === null) {
        await this.notificationService.createForUsersWithPermission(
          LAB_ORDER_WRITE_ANY_PERMISSION,
          {
            type: message.type,
            titleKey: message.titleKey,
            bodyKey: message.bodyKey,
            params: message.params,
            href,
          },
        );
        return;
      }
      if (doctorUserId === currentUser.sub) {
        return;
      }
      await this.notificationService.createForUser({
        userId: doctorUserId,
        type: message.type,
        titleKey: message.titleKey,
        bodyKey: message.bodyKey,
        params: message.params,
        href,
      });
    } catch (caughtError) {
      this.logger.warn(
        `Lab result notification failed for order ${order.id}: ${
          caughtError instanceof Error ? caughtError.name : 'unknown'
        }`,
      );
    }
  }

  private isCriticalFlag(flag: LabResultFlagValue | null): boolean {
    return flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH';
  }

  private async findLabOrderOrThrow(id: string): Promise<LabOrderRecord> {
    const order = await this.labOrderRepository.findLabOrderById(id);
    if (!order) {
      throw new NotFoundException('Lab order not found');
    }

    return order;
  }

  private async findLabResultOrThrow(id: string): Promise<LabResultRecord> {
    const result = await this.labResultRepository.findLabResultById(id);
    if (!result) {
      throw new NotFoundException('Lab result not found');
    }

    return result;
  }

  private async findResultLocationOrThrow(
    id: string,
  ): Promise<{ labOrderId: string; labOrderItemId: string }> {
    const location = await this.labResultRepository.findOrderIdByResultId(id);
    if (!location) {
      throw new NotFoundException('Lab result not found');
    }

    return location;
  }

  private toClinicDayStart(date: string): Date {
    return getStartOfCalendarDateInTimeZone(date, this.clinicTimeZone);
  }
}
