import { Injectable } from '@nestjs/common';

import { SatusehatKycOperator } from '@hms/shared-types';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * The signed-in operator as `generate-url` wants them (P24-T16, D-039): the
 * account's name and one NIK, the clinician profile's first and the account's
 * second. The only reader of `users.nik_ciphertext` there is, and the value
 * it decrypts goes straight into an encrypted request body — never into a
 * response, a log or an audit row.
 */
@Injectable()
export class SatusehatKycOperatorRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifierCrypto: NationalIdentifierCryptoService,
  ) {}

  async findOperator(userId: string): Promise<SatusehatKycOperator | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        fullName: true,
        nikCiphertext: true,
        doctorProfile: { select: { nikCiphertext: true, deletedAt: true } },
      },
    });
    if (user === null) {
      return null;
    }
    const profileCiphertext =
      user.doctorProfile !== null && user.doctorProfile.deletedAt === null
        ? user.doctorProfile.nikCiphertext
        : null;
    const nikCiphertext = profileCiphertext ?? user.nikCiphertext;
    return {
      name: user.fullName,
      nik: nikCiphertext === null ? null : this.identifierCrypto.decryptIdentifier(nikCiphertext),
    };
  }
}
