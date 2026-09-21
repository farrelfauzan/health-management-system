import { SatusehatPostnatalEpisodeFinish } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * The PNC episode's own reads and writes (P25-T12), beside
 * `SatusehatSubmissionRepository` rather than in it: that one reads the whole
 * visit bundle, and this is only the episode id and the close.
 */
@Injectable()
export class SatusehatPostnatalRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: NationalIdentifierCryptoService,
  ) {}

  /**
   * Records the PNC episode id the moment it is known, before the bundle that
   * needs it goes out — the ANC rule (P25-T08), for the same reason.
   */
  async savePostnatalEpisodeOfCareId(payload: {
    pregnancyEpisodeId: string;
    satusehatEpisodeOfCareId: string;
  }): Promise<void> {
    await this.prisma.pregnancyEpisode.update({
      where: { id: payload.pregnancyEpisodeId },
      data: { satusehatPostnatalEpisodeOfCareId: payload.satusehatEpisodeOfCareId },
    });
  }

  /** What closing one birth's PNC episode needs, read at send time. */
  async findPostnatalEpisodeFinishData(
    pregnancyEpisodeId: string,
  ): Promise<SatusehatPostnatalEpisodeFinish | null> {
    const episode = await this.prisma.pregnancyEpisode.findFirst({
      where: { id: pregnancyEpisodeId, deletedAt: null },
      select: {
        id: true,
        patientId: true,
        satusehatPostnatalEpisodeOfCareId: true,
        deliveryRecord: { select: { birthAt: true } },
        patient: { select: { satusehatPatientIdCiphertext: true } },
      },
    });
    if (episode === null) {
      return null;
    }
    const ciphertext = episode.patient.satusehatPatientIdCiphertext;
    return {
      pregnancyEpisodeId: episode.id,
      patientId: episode.patientId,
      patientIhsNumber: ciphertext === null ? null : this.cryptoService.decryptIdentifier(ciphertext),
      satusehatPostnatalEpisodeOfCareId: episode.satusehatPostnatalEpisodeOfCareId,
      birthAt: episode.deliveryRecord?.birthAt ?? null,
    };
  }
}
