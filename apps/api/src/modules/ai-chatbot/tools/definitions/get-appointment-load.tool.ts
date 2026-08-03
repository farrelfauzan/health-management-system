import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChatChannelValue,
  ChatToolAppointmentLoadSession,
  ChatToolNameValue,
  DoctorSessionCalendarItem,
  GetAppointmentLoadToolResult,
  getAppointmentLoadToolArgsSchema,
  getAppointmentLoadToolResultSchema,
  getCalendarDateInTimeZone,
} from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { ActorPermissionScope } from '../../../../common/authorization/actor.types';
import { AppointmentManagementService } from '../../../appointment-management/service/appointment-management.service';
import { ChatTool } from '../chat-tool.interface';
import { projectToolResult } from '../project-tool-result';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

/**
 * "How booked are we this week?" (P15-T18).
 *
 * **The permission this declares is `AppointmentSession:read`, not
 * `Appointment:read`, and the correction is the §4.1 rule working rather than
 * a typo repair** — the same failure the two pharmacy rows had at `P15-T05`.
 * §2.1.2's table paired this tool with `appointment.read:any`, but
 * `listSessionsCalendar` asserts `AppointmentSession:read`. `ADMIN` happens to
 * hold both, so the wrong declaration would have worked today and broken
 * silently the moment the grants diverged — and invariant 2 is that a tool is
 * the same door as the REST route, which means declaring the permission that
 * route actually opens.
 *
 * The projection carries capacity and booked counts and **no attendee rows**.
 * `DoctorSessionCalendarItem` has none to begin with, which is why this tool
 * is cheap: the roster lives on `getSessionQueue`, and no tool calls it.
 */
@Injectable()
export class GetAppointmentLoadTool implements ChatTool {
  readonly name: ChatToolNameValue = 'get_appointment_load';

  readonly description: string = [
    'Practice-session capacity and how much of it is booked, over a date range of up to 31 days.',
    'Kapasitas jadwal praktik dan seberapa penuh terisi, untuk rentang tanggal maksimal 31 hari.',
    'Use for: "jadwal praktik minggu ini seberapa penuh", "masih ada slot besok?", "how booked are we this week", "dokter mana yang paling padat".',
    'Do NOT use for: siapa saja yang sudah booking — daftar pasien tidak tersedia lewat tool ini; antrean hari berjalan (pakai get_queue_board_summary); atau pendapatan (pakai get_daily_cashier_report).',
  ].join('\n');

  readonly channels: readonly ChatChannelValue[] = ['ADMIN'];

  readonly allowedRoleCodes: readonly string[] = ['ADMIN', 'SUPER_ADMIN'];

  readonly requiredPermission: {
    readonly resource: string;
    readonly action: string;
    readonly scope: ActorPermissionScope;
  } = { resource: 'AppointmentSession', action: 'read', scope: 'ANY' };

  readonly argumentSchema = getAppointmentLoadToolArgsSchema;

  private readonly clinicTimeZone: string;

  constructor(
    private readonly appointmentManagementService: AppointmentManagementService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone =
      configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async execute(
    user: CurrentUser,
    validatedArguments: unknown,
  ): Promise<GetAppointmentLoadToolResult> {
    const { from, to } = getAppointmentLoadToolArgsSchema.parse(validatedArguments);
    // Both ends are resolved here rather than left to the model: a single-day
    // question is the common case and should not require it to repeat a date
    // it may have derived wrongly. The service enforces the range limit.
    const fromDate = from ?? getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
    const toDate = to ?? fromDate;
    const sessions = await this.appointmentManagementService.listSessionsCalendar(
      { from: fromDate, to: toDate },
      user,
    );
    return projectToolResult(getAppointmentLoadToolResultSchema, {
      from: fromDate,
      to: toDate,
      sessionCount: sessions.length,
      totalBooked: sessions.reduce((total, session) => total + session.bookedCount, 0),
      items: sessions.map((session) => this.toLoadSession(session)),
    });
  }

  /**
   * The allowlist. `id`, `scheduleId` and `doctorId` are dropped — internal
   * handles that answer nothing an administrator asked, and in Mode B they
   * would be identifiers travelling for no reason.
   */
  private toLoadSession(session: DoctorSessionCalendarItem): ChatToolAppointmentLoadSession {
    return {
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      endTime: session.endTime,
      doctorName: session.doctor.fullName,
      ...(session.doctor.specialty === undefined ? {} : { specialty: session.doctor.specialty }),
      status: session.status,
      maxPatients: session.maxPatients,
      bookedCount: session.bookedCount,
      remaining: session.remaining,
    };
  }
}
