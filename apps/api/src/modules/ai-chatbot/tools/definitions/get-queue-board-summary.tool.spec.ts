import { ForbiddenException } from '@nestjs/common';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { RegistrationFlowService } from '../../../registration-flow/service/registration-flow.service';
import { GetQueueBoardSummaryTool } from './get-queue-board-summary.tool';

describe('GetQueueBoardSummaryTool', () => {
  const mockUser: CurrentUser = { sub: 'admin-user-1', email: 'admin@clinic.local' };

  /**
   * The real `QueueBoardResponse`, **including a populated `entries[]`**.
   * That array is the reason this tool's allowlist exists: it carries one row
   * per queued patient, by name and by medical record number.
   */
  function buildQueueBoard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      date: '2026-08-03',
      counts: { pending: 7, checkedIn: 5, completed: 12, cancelled: 1 },
      poli: [
        {
          poli: { id: 'poli-1', name: 'Poli Umum' },
          waiting: 8,
          counts: { pending: 5, checkedIn: 3, completed: 9, cancelled: 1 },
          lastIssuedNumber: 18,
        },
      ],
      entries: [
        {
          registrationId: 'registration-1',
          queueNumber: 4,
          status: 'CHECKED_IN',
          patient: { id: 'patient-1', mrn: 'MRN00000042', fullName: 'Budi Santoso' },
          poli: { id: 'poli-1', name: 'Poli Umum' },
        },
        {
          registrationId: 'registration-2',
          queueNumber: 5,
          status: 'PENDING',
          patient: { id: 'patient-2', mrn: 'MRN00000043', fullName: 'Ani Lestari' },
          poli: { id: 'poli-1', name: 'Poli Umum' },
        },
      ],
      ...overrides,
    };
  }

  function buildTool(getQueueBoard: jest.Mock): GetQueueBoardSummaryTool {
    return new GetQueueBoardSummaryTool({
      getQueueBoard,
    } as unknown as RegistrationFlowService);
  }

  it('is an admin-channel tool requiring registration.read:any', () => {
    const actualTool = buildTool(jest.fn());

    expect(actualTool.requiredPermission).toEqual({
      resource: 'Registration',
      action: 'read',
      scope: 'ANY',
    });
    expect(actualTool.channels).toEqual(['ADMIN']);
    expect(actualTool.allowedRoleCodes).toEqual(['ADMIN', 'SUPER_ADMIN']);
  });

  it('drops the entire entries array, names and MRNs with it', async () => {
    // §2.1.2's rule made mechanical: an admin tool returns counts, never a
    // row about an identified patient. The service returned two named
    // patients and none of it survives.
    const mockGetQueueBoard = jest.fn().mockResolvedValue(buildQueueBoard());

    const actualResult = await buildTool(mockGetQueueBoard).execute(mockUser, {});

    const serialized = JSON.stringify(actualResult);
    expect(serialized).not.toContain('Budi Santoso');
    expect(serialized).not.toContain('Ani Lestari');
    expect(serialized).not.toContain('MRN00000042');
    expect(serialized).not.toContain('registration-1');
    expect(serialized).not.toContain('patient-1');
    expect(serialized).not.toContain('entries');
  });

  it('flattens the counts and derives waiting from them', async () => {
    const mockGetQueueBoard = jest.fn().mockResolvedValue(buildQueueBoard());

    const actualResult = await buildTool(mockGetQueueBoard).execute(mockUser, {});

    expect(actualResult).toEqual({
      date: '2026-08-03',
      waiting: 12,
      pending: 7,
      checkedIn: 5,
      completed: 12,
      cancelled: 1,
      poli: [
        {
          poliName: 'Poli Umum',
          waiting: 8,
          pending: 5,
          checkedIn: 3,
          completed: 9,
          cancelled: 1,
        },
      ],
    });
  });

  it('leaves "today" to the service rather than resolving it twice', async () => {
    const mockGetQueueBoard = jest.fn().mockResolvedValue(buildQueueBoard());

    await buildTool(mockGetQueueBoard).execute(mockUser, {});

    // One resolver for the clinic day means the two cannot disagree at a
    // midnight boundary.
    expect(mockGetQueueBoard).toHaveBeenCalledWith({}, mockUser);
  });

  it('passes an explicit date through as the asking user', async () => {
    const mockGetQueueBoard = jest.fn().mockResolvedValue(buildQueueBoard());

    await buildTool(mockGetQueueBoard).execute(mockUser, { date: '2026-08-10' });

    expect(mockGetQueueBoard).toHaveBeenCalledWith({ date: '2026-08-10' }, mockUser);
  });

  it('cannot leak a patient field a future edit adds to the poli summary', async () => {
    const mockGetQueueBoard = jest.fn().mockResolvedValue(
      buildQueueBoard({
        poli: [
          {
            poli: { id: 'poli-1', name: 'Poli Umum' },
            waiting: 1,
            counts: { pending: 1, checkedIn: 0, completed: 0, cancelled: 0 },
            lastIssuedNumber: 3,
            nextPatientName: 'Budi Santoso',
          },
        ],
      }),
    );

    const actualResult = await buildTool(mockGetQueueBoard).execute(mockUser, {});

    expect(JSON.stringify(actualResult)).not.toContain('Budi Santoso');
  });

  it('lets the domain refusal through unchanged', async () => {
    const mockGetQueueBoard = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('You are not allowed to read the queue board'));

    await expect(buildTool(mockGetQueueBoard).execute(mockUser, {})).rejects.toThrow(
      ForbiddenException,
    );
  });
});
