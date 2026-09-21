import { buildPostnatalVisitWindows } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PostnatalVisitRepository } from '../repository/postnatal-visit.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

/**
 * Enqueues the close of a birth's SATUSEHAT PNC episode once nifas is over
 * (P25-T12): after the last instant of KF4 — the end of day 42 on the
 * clinic's clock — whether or not KF4 was ever recorded. The playbook closes
 * the episode at 42 days both when the mother completed nifas and when
 * contact was lost, so a missed KF4 is not a reason to keep it open.
 *
 * The PATCH itself is sent by the SATUSEHAT worker; this only writes the
 * outbox row, and only for a birth that never had one.
 */
@Injectable()
export class PostnatalEpisodeCloseService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly postnatalVisitRepository: PostnatalVisitRepository,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /** Enqueues every close that is due at `asOf` and returns how many it wrote. */
  async enqueueDueCloses(asOf: Date): Promise<number> {
    const candidates = await this.postnatalVisitRepository.findEpisodeCloseCandidates(asOf);
    const due = candidates.filter((candidate) => this.isNifasOver(candidate.birthAt, asOf));
    let enqueuedCount = 0;
    for (const candidate of due) {
      if (await this.postnatalVisitRepository.enqueueEpisodeClose(candidate.pregnancyEpisodeId)) {
        enqueuedCount += 1;
      }
    }
    return enqueuedCount;
  }

  private isNifasOver(birthAt: Date, asOf: Date): boolean {
    const lastWindow = buildPostnatalVisitWindows({ birthAt, timeZone: this.clinicTimeZone }).find(
      (window) => window.code === 'KF4',
    );
    return lastWindow !== undefined && asOf.getTime() > lastWindow.endsAt.getTime();
  }
}
