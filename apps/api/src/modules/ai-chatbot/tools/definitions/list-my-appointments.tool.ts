import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AI_CHAT_TOOL_LIST_PAGE_LIMIT,
  ChatChannelValue,
  ChatToolAppointmentItem,
  ChatToolNameValue,
  ListMyAppointmentsToolResult,
  getCalendarDateInTimeZone,
  getStartOfCalendarDateInTimeZone,
  listMyAppointmentsToolArgsSchema,
  listMyAppointmentsToolResultSchema,
} from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { ActorPermissionScope } from '../../../../common/authorization/actor.types';
import { AppointmentManagementService } from '../../../appointment-management/service/appointment-management.service';
import { ChatTool } from '../chat-tool.interface';
import { projectToolResult } from '../project-tool-result';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const DAY_IN_MS = 86_400_000;

/**
 * "What does my day look like?" (P15-T06).
 *
 * **"Today" is resolved on the server, in the clinic's timezone.** The model
 * is not asked what today's date is and its answer would not be trusted if it
 * gave one: a model's notion of the current date comes from its training data
 * and its context window, and a schedule tool that accepted it would answer
 * confidently about the wrong day. An omitted `date` argument therefore means
 * "today" resolved here, and the resolved date is returned in the result so
 * the client can render what was actually asked.
 */
@Injectable()
export class ListMyAppointmentsTool implements ChatTool {
  readonly name: ChatToolNameValue = 'list_my_appointments';

  readonly description: string = [
    'The asking doctor’s own appointments for one calendar date, defaulting to today in the clinic timezone.',
    'Jadwal janji temu dokter yang bertanya untuk satu tanggal, default hari ini.',
    'Use for: "jadwal saya hari ini", "pasien saya besok siapa saja", "berapa janji temu saya", "what is on my schedule".',
    'Do NOT use for: seluruh pasien yang ditugaskan tanpa tanggal (pakai list_my_patients), detail satu pasien (pakai get_patient_summary), atau jadwal dokter lain.',
    'Omit date for today. Never guess today’s date — the server resolves it.',
  ].join('\n');

  readonly channels: readonly ChatChannelValue[] = ['DOCTOR'];

  readonly allowedRoleCodes: readonly string[] = ['DOCTOR'];

  readonly requiredPermission: {
    readonly resource: string;
    readonly action: string;
    readonly scope: ActorPermissionScope;
  } = { resource: 'Appointment', action: 'read', scope: 'OWN' };

  readonly argumentSchema = listMyAppointmentsToolArgsSchema;

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
  ): Promise<ListMyAppointmentsToolResult> {
    const { date } = listMyAppointmentsToolArgsSchema.parse(validatedArguments);
    const calendarDate = date ?? getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
    const dayStart = getStartOfCalendarDateInTimeZone(calendarDate, this.clinicTimeZone);
    const result = await this.appointmentManagementService.listAppointments(
      {
        page: 1,
        limit: AI_CHAT_TOOL_LIST_PAGE_LIMIT,
        scheduledFrom: dayStart.toISOString(),
        scheduledTo: new Date(dayStart.getTime() + DAY_IN_MS).toISOString(),
      },
      user,
    );
    return projectToolResult(listMyAppointmentsToolResultSchema, {
      date: calendarDate,
      matchCount: result.meta.total,
      items: result.items.map((appointment) => this.toAppointmentItem(appointment)),
    });
  }

  /**
   * The §4.3 allowlist. The backing projection carries the subject's `mrn`
   * and the appointment's free-text `reason` and `notes` — the two fields
   * most likely to hold a clinical narrative someone typed in a hurry — plus
   * `createdById` and the row timestamps. None is named here, so a future
   * edit widening that projection cannot leak through this tool.
   *
   * `subject` rather than `patient` since `P17-T02`, and the name is doing
   * work: the id this returns is a `ProspectivePatient` id when the booking
   * came from a chat and nobody has arrived yet. It is safe for the assistant
   * to *say* — it is the name the customer gave — but it is not a patient id
   * and must never be handed to a tool that reads a medical record.
   */
  private toAppointmentItem(appointment: {
    id: string;
    scheduledAt: string;
    status: string;
    type: string;
    queueNumber?: number;
    subject: { id: string; fullName: string };
  }): ChatToolAppointmentItem {
    return {
      appointmentId: appointment.id,
      patientId: appointment.subject.id,
      patientName: appointment.subject.fullName,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
      type: appointment.type,
      ...(appointment.queueNumber === undefined ? {} : { queueNumber: appointment.queueNumber }),
    };
  }
}
