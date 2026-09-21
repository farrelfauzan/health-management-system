import { ConfigService } from '@nestjs/config';

import { PostnatalVisitRepository } from '../repository/postnatal-visit.repository';
import { PostnatalEpisodeCloseService } from './postnatal-episode-close.service';

/** 1 October 03:00 WIB; KF4 closes at the end of 12 November, clinic time. */
const BIRTH_AT = new Date('2026-10-01T03:00:00+07:00');

describe('PostnatalEpisodeCloseService', () => {
  const repositoryMock = {
    findEpisodeCloseCandidates: jest.fn(),
    enqueueEpisodeClose: jest.fn(),
  };
  const service = new PostnatalEpisodeCloseService(
    repositoryMock as unknown as PostnatalVisitRepository,
    { get: jest.fn(() => 'Asia/Jakarta') } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    repositoryMock.findEpisodeCloseCandidates.mockResolvedValue([
      { pregnancyEpisodeId: 'pregnancy-1', birthAt: BIRTH_AT },
    ]);
    repositoryMock.enqueueEpisodeClose.mockResolvedValue(true);
  });

  it('waits while KF4 is still open on 12 November', async () => {
    const actualCount = await service.enqueueDueCloses(new Date('2026-11-12T23:59:59.999+07:00'));

    expect(actualCount).toBe(0);
    expect(repositoryMock.enqueueEpisodeClose).not.toHaveBeenCalled();
  });

  it('enqueues the close once 12 November has passed', async () => {
    const actualCount = await service.enqueueDueCloses(new Date('2026-11-13T00:00:00+07:00'));

    expect(actualCount).toBe(1);
    expect(repositoryMock.enqueueEpisodeClose).toHaveBeenCalledWith('pregnancy-1');
  });

  it('counts nothing when a racing sweep already holds the open row', async () => {
    repositoryMock.enqueueEpisodeClose.mockResolvedValue(false);

    await expect(service.enqueueDueCloses(new Date('2026-11-20T00:00:00+07:00'))).resolves.toBe(0);
  });
});
