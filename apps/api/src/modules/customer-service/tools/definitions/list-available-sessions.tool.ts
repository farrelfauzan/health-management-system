import { Injectable, Logger } from '@nestjs/common';

import {
  DoctorSessionCalendarItem,
  ListAvailableSessionsArgumentsInput,
  listAvailableSessionsArgumentsSchema,
  listAvailableSessionsResultSchema,
} from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../../common/observability/safe-logging';
import { AppointmentManagementService } from '../../../appointment-management/service/appointment-management.service';
import { encodeChannelSessionReference } from '../../service/channel-session-reference';
import { CsSystemActorService } from '../../service/cs-system-actor.service';
import { CsTool } from '../cs-tool.interface';
import { CsToolContext, CsToolExecution } from '../cs-tool.types';

/**
 * How many sessions one call may return.
 *
 * A cap on the *reply*, not on the search. Two weeks of a clinic's whole
 * roster is easily a hundred windows, which is unreadable on a phone and is a
 * larger extract of the doctors' working patterns than an anonymous caller has
 * any reason to receive in one message. The list is date-ordered, so the cut
 * falls at the far end of the range rather than at random.
 */
const MAX_SESSIONS_RETURNED = 20;

/**
 * `list_available_sessions` — what the clinic has open, and nothing about who
 * is in it (strategy §4.2).
 *
 * **The filtering happens here rather than in a query**, and that is a real
 * trade made deliberately. The staff calendar projection is what merges
 * materialised sessions with windows nobody has booked yet and computes
 * remaining capacity; asking the database for "doctors whose name or specialty
 * matches" would mean a second projection, and two implementations of "is this
 * session full" is exactly the drift that lets the channel offer a seat the
 * dashboard knows is gone. So the calendar is read whole for the range and
 * narrowed in memory — over a fourteen-day window for one clinic, that is a
 * small list.
 *
 * The name filter is a substring match on both the doctor and the poli,
 * because a customer types "dokter gigi" or "Sinta" and means the same request
 * either way, and there is no third thing in the projection they could
 * accidentally match on.
 */
@Injectable()
export class ListAvailableSessionsTool implements CsTool {
  private readonly logger = new Logger(ListAvailableSessionsTool.name);

  readonly name = 'list_available_sessions' as const;

  readonly description = [
    'Lihat jadwal sesi praktik dokter yang masih bisa dipesan dalam rentang tanggal (maksimal 14 hari).',
    'Kembalikan kepada pelanggan sebagai pilihan bernomor beserta nama dokter, poli, tanggal, dan jam sesi.',
    'Jangan pernah menjanjikan jam kedatangan yang pasti: pelanggan datang di dalam rentang jam sesi dan nomor antrean diberikan saat check-in.',
    'Simpan nilai sessionId untuk dipakai di book_appointment.',
  ].join(' ');

  readonly argumentSchema = listAvailableSessionsArgumentsSchema;

  readonly resultSchema = listAvailableSessionsResultSchema;

  constructor(
    private readonly appointmentService: AppointmentManagementService,
    private readonly systemActorService: CsSystemActorService,
  ) {}

  async execute(_context: CsToolContext, validatedArguments: unknown): Promise<CsToolExecution> {
    const args = validatedArguments as ListAvailableSessionsArgumentsInput;
    const actor = await this.systemActorService.resolveActor();
    const sessions = await this.readCalendar(args, actor);
    const matching = sessions
      .filter((session) => session.status === 'OPEN')
      .filter((session) => this.matchesRequestedName(session, args.poliOrDoctorName))
      .slice(0, MAX_SESSIONS_RETURNED);
    return {
      result: {
        sessions: matching.map((session) => ({
          sessionId: encodeChannelSessionReference({
            doctorId: session.doctorId,
            scheduleId: session.scheduleId,
            sessionDate: session.sessionDate,
          }),
          doctorName: session.doctor.fullName,
          specialty: session.doctor.specialty,
          sessionDate: session.sessionDate,
          startTime: session.startTime,
          endTime: session.endTime,
          remaining: session.remaining,
          isFull: session.remaining !== null && session.remaining <= 0,
        })),
      },
    };
  }

  /**
   * An unreachable calendar returns no sessions rather than throwing, the same
   * degradation `search_faq` makes: the customer gets "I could not find a
   * schedule, please contact the front desk", never an error on their
   * WhatsApp.
   */
  private async readCalendar(
    args: ListAvailableSessionsArgumentsInput,
    actor: Awaited<ReturnType<CsSystemActorService['resolveActor']>>,
  ): Promise<DoctorSessionCalendarItem[]> {
    try {
      return await this.appointmentService.listSessionsCalendar(
        { from: args.dateFrom, to: args.dateTo },
        actor,
      );
    } catch (caughtError) {
      this.logger.warn(
        buildSafeErrorLog('cs_session_calendar_failed', {
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return [];
    }
  }

  private matchesRequestedName(
    session: DoctorSessionCalendarItem,
    requestedName: string | undefined,
  ): boolean {
    if (requestedName === undefined) {
      return true;
    }
    const needle = requestedName.toLocaleLowerCase('id-ID');
    return (
      session.doctor.fullName.toLocaleLowerCase('id-ID').includes(needle) ||
      session.doctor.specialty.toLocaleLowerCase('id-ID').includes(needle)
    );
  }
}
