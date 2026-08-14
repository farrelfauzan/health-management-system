import {
  DoctorSessionCalendarItem,
  listAvailableSessionsArgumentsSchema,
} from '@hms/shared-types';

import { AppointmentManagementService } from '../../../appointment-management/service/appointment-management.service';
import { CsSystemActorService } from '../../service/cs-system-actor.service';
import { CsToolContext } from '../cs-tool.types';
import { ListAvailableSessionsTool } from './list-available-sessions.tool';

/**
 * The clinic stores English specialty names and the channel receives
 * Indonesian, so every case here is really the same question: does a customer
 * naming a poli the way customers name it get the sessions that exist?
 */
describe('ListAvailableSessionsTool', () => {
  const inputContext: CsToolContext = {
    conversationId: 'conversation-1',
    channel: 'TELEGRAM',
    externalChatId: 'chat-1',
  };

  function buildSession(doctorId: string, specialty: string): DoctorSessionCalendarItem {
    return {
      id: `session-${doctorId}`,
      scheduleId: `schedule-${doctorId}`,
      doctorId,
      sessionDate: '2026-08-17',
      startTime: '08:00',
      endTime: '12:00',
      status: 'OPEN',
      maxPatients: 10,
      bookedCount: 2,
      remaining: 8,
      doctor: { id: doctorId, fullName: `dr. ${doctorId}`, specialty },
    };
  }

  function buildTool(sessions: readonly DoctorSessionCalendarItem[]): ListAvailableSessionsTool {
    const mockAppointmentService = {
      listSessionsCalendar: jest.fn().mockResolvedValue(sessions),
    } as unknown as AppointmentManagementService;
    const mockActorService = {
      resolveActor: jest.fn().mockResolvedValue({ id: 'system-actor' }),
    } as unknown as CsSystemActorService;
    return new ListAvailableSessionsTool(mockAppointmentService, mockActorService);
  }

  async function executeWithName(
    sessions: readonly DoctorSessionCalendarItem[],
    poliOrDoctorName: string | undefined,
  ): Promise<readonly { specialty: string }[]> {
    const tool = buildTool(sessions);
    const execution = await tool.execute(inputContext, {
      dateFrom: '2026-08-14',
      dateTo: '2026-08-28',
      ...(poliOrDoctorName === undefined ? {} : { poliOrDoctorName }),
    });
    return (execution.result as { sessions: readonly { specialty: string }[] }).sessions;
  }

  it('matches an Indonesian poli name against the English specialty', async () => {
    const inputSessions = [buildSession('a', 'Pediatrics'), buildSession('b', 'Dentistry')];
    const actualSessions = await executeWithName(inputSessions, 'poli anak');
    expect(actualSessions.map((session) => session.specialty)).toEqual(['Pediatrics']);
  });

  it.each([
    ['poli gigi', 'Dentistry'],
    ['poli umum', 'General Practice'],
    ['dokter mata', 'Ophthalmology'],
    ['poli kandungan', 'Obstetrics & Gynecology'],
    ['THT', 'Otorhinolaryngology (ENT)'],
    ['penyakit dalam', 'Internal Medicine'],
  ])('resolves %s to %s', async (inputName, expectedSpecialty) => {
    const inputSessions = [
      buildSession('a', 'Dentistry'),
      buildSession('b', 'General Practice'),
      buildSession('c', 'Ophthalmology'),
      buildSession('d', 'Obstetrics & Gynecology'),
      buildSession('e', 'Otorhinolaryngology (ENT)'),
      buildSession('f', 'Internal Medicine'),
    ];
    const actualSessions = await executeWithName(inputSessions, inputName);
    expect(actualSessions.map((session) => session.specialty)).toEqual([expectedSpecialty]);
  });

  it('does not hand every session to a customer who named one poli', async () => {
    const inputSessions = [
      buildSession('a', 'Pediatrics'),
      buildSession('b', 'Cardiology'),
      buildSession('c', 'Dentistry'),
    ];
    const actualSessions = await executeWithName(inputSessions, 'anak');
    expect(actualSessions.map((session) => session.specialty)).toEqual(['Pediatrics']);
  });

  it('still matches the English name a staff-facing caller would use', async () => {
    const inputSessions = [buildSession('a', 'Pediatrics'), buildSession('b', 'Dentistry')];
    const actualSessions = await executeWithName(inputSessions, 'pediatrics');
    expect(actualSessions.map((session) => session.specialty)).toEqual(['Pediatrics']);
  });

  it('still matches a doctor by name', async () => {
    const inputSessions = [buildSession('sinta', 'Pediatrics'), buildSession('budi', 'Dentistry')];
    const actualSessions = await executeWithName(inputSessions, 'sinta');
    expect(actualSessions).toHaveLength(1);
  });

  it('returns everything open when no name is given', async () => {
    const inputSessions = [buildSession('a', 'Pediatrics'), buildSession('b', 'Dentistry')];
    const actualSessions = await executeWithName(inputSessions, undefined);
    expect(actualSessions).toHaveLength(2);
  });

  /**
   * The window is counted **inclusively**, which is the detail the system
   * prompt has to state correctly: a prompt that says "14 hari ke depan" makes
   * the model send `dateFrom + 14`, which is fifteen days and is rejected, and
   * the customer sees a bot that silently fails to look anything up.
   */
  describe('argument schema', () => {
    it('accepts a fourteen-day inclusive window', () => {
      const actualResult = listAvailableSessionsArgumentsSchema.safeParse({
        dateFrom: '2026-08-14',
        dateTo: '2026-08-27',
      });
      expect(actualResult.success).toBe(true);
    });

    it('rejects dateFrom + 14, which is fifteen inclusive days', () => {
      const actualResult = listAvailableSessionsArgumentsSchema.safeParse({
        dateFrom: '2026-08-14',
        dateTo: '2026-08-28',
      });
      expect(actualResult.success).toBe(false);
    });
  });

  it('returns nothing rather than throwing when the calendar is unreachable', async () => {
    const mockAppointmentService = {
      listSessionsCalendar: jest.fn().mockRejectedValue(new Error('calendar down')),
    } as unknown as AppointmentManagementService;
    const mockActorService = {
      resolveActor: jest.fn().mockResolvedValue({ id: 'system-actor' }),
    } as unknown as CsSystemActorService;
    const tool = new ListAvailableSessionsTool(mockAppointmentService, mockActorService);
    const execution = await tool.execute(inputContext, {
      dateFrom: '2026-08-14',
      dateTo: '2026-08-28',
      poliOrDoctorName: 'poli anak',
    });
    expect((execution.result as { sessions: readonly unknown[] }).sessions).toEqual([]);
  });
});
