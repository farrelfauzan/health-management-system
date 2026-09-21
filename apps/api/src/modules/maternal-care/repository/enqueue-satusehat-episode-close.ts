import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';

/**
 * Enqueues the close of one pregnancy's SATUSEHAT episode (P25-T08).
 *
 * Takes the transaction rather than opening one: the row is a transactional
 * outbox entry, and its whole value is that it cannot be written unless the
 * pregnancy really ended.
 *
 * Two pregnancies are skipped rather than enqueued:
 *
 * - one with no `satusehatEpisodeOfCareId`, which has nothing on the platform
 *   to close — an unconfigured deployment, or a woman who ended the pregnancy
 *   before any visit of hers was reported;
 * - one that already has an open close waiting. The partial unique index would
 *   refuse the second row anyway, and refusing it here means correcting the end
 *   date twice before the worker runs does not fail the second correction. The
 *   pending row re-reads the pregnancy when it is picked up, so it sends the
 *   corrected date.
 */
export async function enqueueSatusehatEpisodeClose(
  tx: PrismaTransactionClient,
  pregnancyEpisodeId: string,
): Promise<void> {
  const episode = await tx.pregnancyEpisode.findUnique({
    where: { id: pregnancyEpisodeId },
    select: { satusehatEpisodeOfCareId: true },
  });
  if (episode === null || episode.satusehatEpisodeOfCareId === null) {
    return;
  }
  const openClose = await tx.satusehatSubmission.findFirst({
    where: {
      pregnancyEpisodeId,
      kind: 'EPISODE_OF_CARE_FINISH',
      status: { not: 'SUBMITTED' },
    },
    select: { id: true },
  });
  if (openClose !== null) {
    return;
  }
  await tx.satusehatSubmission.create({
    data: { pregnancyEpisodeId, kind: 'EPISODE_OF_CARE_FINISH' },
  });
}
