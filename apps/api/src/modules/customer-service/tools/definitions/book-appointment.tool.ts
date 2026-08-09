import { Injectable } from '@nestjs/common';

import {
  BookAppointmentArgumentsInput,
  bookAppointmentArgumentsSchema,
  bookAppointmentResultSchema,
} from '@hms/shared-types';

import { ChannelBookingService } from '../../service/channel-booking.service';
import { CsSystemActorService } from '../../service/cs-system-actor.service';
import { CsTool } from '../cs-tool.interface';
import { CsToolContext, CsToolExecution } from '../cs-tool.types';

/**
 * `book_appointment` — the only tool on this channel that writes anything
 * (strategy §4.2, §5, D-CS-03).
 *
 * The tool itself is a thin adapter over {@link ChannelBookingService}, and
 * that is the point: everything that decides *whether* a booking may attach to
 * a patient record, and everything that words the confirmation, belongs to a
 * service that can be tested without a model in the loop. What lives here is
 * the contract the model sees — and the most important thing about that
 * contract is what it lacks.
 *
 * **There is no NIK parameter, no BPJS parameter, no date of birth, and no
 * address** (D-CS-03). The system prompt also says not to ask for those, but a
 * prompt is a request; this is a wall. A model that decided to collect a NIK
 * would have nowhere to put it, the redaction layer would already have
 * stripped it from the turn, and the draft patient it books against has null
 * columns where those values would go. Three independent mechanisms, because
 * the one that is only a sentence in a prompt is the one that fails.
 */
@Injectable()
export class BookAppointmentTool implements CsTool {
  readonly name = 'book_appointment' as const;

  readonly description = [
    'Buat janji temu pada sesi yang sudah dipilih pelanggan.',
    'Panggil hanya setelah pelanggan memilih sesi dari list_available_sessions dan menyebutkan nama lengkap serta nomor telepon.',
    'JANGAN pernah meminta NIK, nomor BPJS, tanggal lahir, alamat, atau keterangan medis — data itu dilengkapi petugas saat pelanggan datang ke klinik.',
  ].join(' ');

  readonly argumentSchema = bookAppointmentArgumentsSchema;

  readonly resultSchema = bookAppointmentResultSchema;

  constructor(
    private readonly bookingService: ChannelBookingService,
    private readonly systemActorService: CsSystemActorService,
  ) {}

  async execute(context: CsToolContext, validatedArguments: unknown): Promise<CsToolExecution> {
    const args = validatedArguments as BookAppointmentArgumentsInput;
    const actor = await this.systemActorService.resolveActor();
    const outcome = await this.bookingService.bookFromChannel({
      conversationId: context.conversationId,
      channel: context.channel,
      externalChatId: context.externalChatId,
      actor,
      patientFullName: args.patientFullName,
      phoneNumber: args.phoneNumber,
      sessionId: args.sessionId,
      ...(args.note === undefined ? {} : { note: args.note }),
    });
    return {
      result: outcome.result,
      ...(outcome.deterministicReply === undefined
        ? {}
        : { deterministicReply: outcome.deterministicReply }),
      ...(outcome.pausesConversation === undefined
        ? {}
        : { pausesConversation: outcome.pausesConversation }),
      ...(outcome.requestContact === undefined
        ? {}
        : { requestContact: outcome.requestContact }),
    };
  }
}
