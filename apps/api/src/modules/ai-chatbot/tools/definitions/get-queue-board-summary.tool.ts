import { Injectable } from '@nestjs/common';

import {
  ChatChannelValue,
  ChatToolNameValue,
  ChatToolQueuePoliSummary,
  GetQueueBoardSummaryToolResult,
  QueueBoardResponse,
  getQueueBoardSummaryToolArgsSchema,
  getQueueBoardSummaryToolResultSchema,
} from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { ActorPermissionScope } from '../../../../common/authorization/actor.types';
import { RegistrationFlowService } from '../../../registration-flow/service/registration-flow.service';
import { ChatTool } from '../chat-tool.interface';
import { projectToolResult } from '../project-tool-result';

/**
 * "How many people are waiting?" (P15-T18).
 *
 * **This is the tool the §4.3 allowlist was designed for.**
 * `QueueBoardResponse` carries `entries[]` — one row per queued patient, by
 * name — alongside the counts, and the tool copies the counts and never the
 * roster. §2.1.2's rule is that an admin tool returns aggregates and never a
 * row about an identified patient; building up to a schema rather than
 * filtering down from the response is what makes that mechanical instead of
 * remembered, and it is why a future edit widening `entries` cannot leak.
 *
 * An admin who genuinely needs the roster has the queue-board screen, which
 * carries its own audit trail. The chat surface is for the aggregate question.
 */
@Injectable()
export class GetQueueBoardSummaryTool implements ChatTool {
  readonly name: ChatToolNameValue = 'get_queue_board_summary';

  readonly description: string = [
    'Queue volume for one clinic day, clinic-wide and per poli — counts only, no patient names.',
    'Berapa banyak pasien mengantre hari ini, per poli. Hanya jumlah, tanpa nama pasien.',
    'Use for: "berapa yang antre", "antrean poli umum ramai?", "how many are waiting", "sudah berapa yang selesai hari ini".',
    'Do NOT use for: siapa saja yang antre — nama pasien tidak tersedia lewat tool ini sama sekali; kapasitas jadwal praktik (pakai get_appointment_load); atau pendapatan (pakai get_daily_cashier_report).',
  ].join('\n');

  readonly channels: readonly ChatChannelValue[] = ['ADMIN'];

  readonly allowedRoleCodes: readonly string[] = ['ADMIN', 'SUPER_ADMIN'];

  readonly requiredPermission: {
    readonly resource: string;
    readonly action: string;
    readonly scope: ActorPermissionScope;
  } = { resource: 'Registration', action: 'read', scope: 'ANY' };

  readonly argumentSchema = getQueueBoardSummaryToolArgsSchema;

  constructor(private readonly registrationFlowService: RegistrationFlowService) {}

  async execute(
    user: CurrentUser,
    validatedArguments: unknown,
  ): Promise<GetQueueBoardSummaryToolResult> {
    const { date } = getQueueBoardSummaryToolArgsSchema.parse(validatedArguments);
    // The service resolves "today" in the clinic timezone when no date is
    // given, so the tool does not resolve it a second time and the two cannot
    // disagree at a midnight boundary.
    const board = await this.registrationFlowService.getQueueBoard(
      date === undefined ? {} : { date },
      user,
    );
    return projectToolResult(getQueueBoardSummaryToolResultSchema, {
      date: board.date,
      // Flattened from `counts` so the answer reads as one row of numbers
      // rather than a nested object the client has to unwrap.
      waiting: board.counts.pending + board.counts.checkedIn,
      pending: board.counts.pending,
      checkedIn: board.counts.checkedIn,
      completed: board.counts.completed,
      cancelled: board.counts.cancelled,
      poli: board.poli.map((poli) => this.toPoliSummary(poli)),
    });
  }

  private toPoliSummary(poli: QueueBoardResponse['poli'][number]): ChatToolQueuePoliSummary {
    return {
      poliName: poli.poli.name,
      waiting: poli.waiting,
      pending: poli.counts.pending,
      checkedIn: poli.counts.checkedIn,
      completed: poli.counts.completed,
      cancelled: poli.counts.cancelled,
    };
  }
}
