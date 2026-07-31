import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChatChannelValue,
  DoctorChatContext,
  PatientChatContext,
  getCalendarDateInTimeZone,
  getStartOfCalendarDateInTimeZone,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { AppointmentManagementService } from '../../appointment-management/service/appointment-management.service';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { RegistrationFlowService } from '../../registration-flow/service/registration-flow.service';
import { redactChatContext } from './redact-chat-context';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const DAY_IN_MS = 86_400_000;
/**
 * How far ahead "next appointment" looks. Appointment lists come back newest
 * first, so the earliest upcoming visit is found by scanning a bounded
 * window rather than paging to the end — 30 days and 100 rows covers any
 * realistic primary-care booking horizon, and a patient beyond it simply
 * gets no next-appointment line rather than a wrong one.
 */
const UPCOMING_WINDOW_DAYS = 30;
const UPCOMING_SCAN_LIMIT = 100;
const CANCELLED_APPOINTMENT_STATUSES: readonly string[] = [
  'CANCELLED',
  'REJECTED',
  'NO_SHOW',
  'COMPLETED',
];

/**
 * Builds the redacted context HMS sends to a third-party provider (§5.3).
 *
 * Two properties make this safe by construction. First, **every read goes
 * through the owning domain service as the authenticated user**, never
 * through a foreign repository — so the domain's own `:own` scoping decides
 * what is visible, and the chatbot can never assemble context the user could
 * not already read themselves. Second, **the result is projected down to the
 * handful of fields §5.3 allows** and then passed through
 * {@link redactChatContext}, so an identifier or clinical note cannot ride
 * along even if an upstream shape changes.
 *
 * Enrichment is **best-effort**: a failed or forbidden domain read degrades
 * that field to absent and is logged without payload content, because a
 * missing appointment summary must never cost a patient their answer.
 *
 * Gated by `AI_CHAT_CONTEXT_ENRICHMENT_ENABLED` (default false) — the
 * delivery plan requires SATUSEHAT master-data linkage to be verified before
 * clinical context reaches a provider in production.
 */
@Injectable()
export class ChatContextEnrichmentService {
  private readonly logger = new Logger(ChatContextEnrichmentService.name);
  private readonly clinicTimeZone: string;

  constructor(
    private readonly patientManagementService: PatientManagementService,
    private readonly appointmentManagementService: AppointmentManagementService,
    private readonly registrationFlowService: RegistrationFlowService,
    private readonly configService: ConfigService,
  ) {
    this.clinicTimeZone =
      configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async buildContext(
    channel: ChatChannelValue,
    actor: CurrentUser,
  ): Promise<Record<string, unknown>> {
    if (!this.isEnrichmentEnabled()) {
      return {};
    }
    const context =
      channel === 'PATIENT'
        ? await this.buildPatientContext(actor)
        : await this.buildDoctorContext(actor);
    return redactChatContext(context as unknown as Record<string, unknown>);
  }

  private async buildPatientContext(actor: CurrentUser): Promise<PatientChatContext> {
    const [displayName, nextAppointment, activeQueueNumber] = await Promise.all([
      this.readOwnDisplayName(actor),
      this.readNextAppointment(actor),
      this.readActiveQueueNumber(actor),
    ]);
    return {
      ...(displayName === undefined ? {} : { displayName }),
      ...(nextAppointment === undefined ? {} : { nextAppointment }),
      ...(activeQueueNumber === undefined ? {} : { activeQueueNumber }),
    };
  }

  private async buildDoctorContext(actor: CurrentUser): Promise<DoctorChatContext> {
    const [todayAppointmentCount, nextAppointment, assignedPatientCount] = await Promise.all([
      this.readTodayAppointmentCount(actor),
      this.readNextAppointment(actor),
      this.readAssignedPatientCount(actor),
    ]);
    return {
      ...(todayAppointmentCount === undefined ? {} : { todayAppointmentCount }),
      // Only the slot time: the doctor channel must not carry patient
      // identity, which is what would turn chat into a bulk export route.
      ...(nextAppointment === undefined ? {} : { nextAppointmentAt: nextAppointment.scheduledAt }),
      ...(assignedPatientCount === undefined ? {} : { assignedPatientCount }),
    };
  }

  /** The patient's own name; a doctor account resolves to no patient row. */
  private async readOwnDisplayName(actor: CurrentUser): Promise<string | undefined> {
    return this.readSafely('display_name', async () => {
      const result = await this.patientManagementService.listPatients(
        { page: 1, limit: 1 },
        actor,
      );
      return result.items[0]?.fullName;
    });
  }

  private async readNextAppointment(
    actor: CurrentUser,
  ): Promise<PatientChatContext['nextAppointment']> {
    return this.readSafely('next_appointment', async () => {
      const now = new Date();
      const result = await this.appointmentManagementService.listAppointments(
        {
          page: 1,
          limit: UPCOMING_SCAN_LIMIT,
          scheduledFrom: now.toISOString(),
          scheduledTo: new Date(now.getTime() + UPCOMING_WINDOW_DAYS * DAY_IN_MS).toISOString(),
        },
        actor,
      );
      const upcoming = result.items
        .filter((item) => !CANCELLED_APPOINTMENT_STATUSES.includes(item.status))
        .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))[0];
      if (upcoming === undefined) {
        return undefined;
      }
      return {
        scheduledAt: upcoming.scheduledAt,
        doctorName: upcoming.doctor.fullName,
        specialty: upcoming.doctor.specialty,
        status: upcoming.status,
      };
    });
  }

  private async readTodayAppointmentCount(actor: CurrentUser): Promise<number | undefined> {
    return this.readSafely('today_appointment_count', async () => {
      const today = getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
      const dayStart = getStartOfCalendarDateInTimeZone(today, this.clinicTimeZone);
      const result = await this.appointmentManagementService.listAppointments(
        {
          page: 1,
          limit: 1,
          scheduledFrom: dayStart.toISOString(),
          scheduledTo: new Date(dayStart.getTime() + DAY_IN_MS).toISOString(),
        },
        actor,
      );
      return result.meta.total;
    });
  }

  /**
   * The count comes from the doctor's own `:own`-scoped patient list, so it
   * is exactly the number of patients assigned to them — a number, never the
   * names behind it.
   */
  private async readAssignedPatientCount(actor: CurrentUser): Promise<number | undefined> {
    return this.readSafely('assigned_patient_count', async () => {
      const result = await this.patientManagementService.listPatients(
        { page: 1, limit: 1 },
        actor,
      );
      return result.meta.total;
    });
  }

  private async readActiveQueueNumber(actor: CurrentUser): Promise<number | undefined> {
    return this.readSafely('active_queue_number', async () => {
      const today = getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
      const result = await this.registrationFlowService.listRegistrations(
        { page: 1, limit: 10, status: 'CHECKED_IN' },
        actor,
      );
      return result.items.find((item) => item.queueDate === today)?.queueNumber;
    });
  }

  /**
   * Runs one context read, converting any failure into an absent field. A
   * forbidden or missing profile is the normal case for the other channel's
   * account type, so this is expected control flow, not an error path — the
   * log names the field only, never the payload.
   */
  private async readSafely<T>(field: string, read: () => Promise<T>): Promise<T | undefined> {
    try {
      return await read();
    } catch {
      this.logger.debug(buildSafeErrorLog('chat_context_read_skipped', { field }));
      return undefined;
    }
  }

  private isEnrichmentEnabled(): boolean {
    return (
      this.configService.get<string>('AI_CHAT_CONTEXT_ENRICHMENT_ENABLED')?.trim().toLowerCase() ===
      'true'
    );
  }
}
