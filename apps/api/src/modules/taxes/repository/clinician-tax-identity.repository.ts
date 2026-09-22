import {
  ClinicianTaxIdentifierRecord,
  ClinicianTaxIdentityRecord,
  CoretaxBp21ClinicianSource,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * A clinician's tax identity as the PPh 21 draft reads it (P27-T07): the NPWP
 * on the profile, else the NIK, which serves as NPWP. Read-only reporting
 * over `doctor_profiles`, the way the report repository reads billing's
 * tables. The masked read never selects the ciphertext; the unmask read
 * decrypts it here and nowhere else, and its caller audits every call.
 */
@Injectable()
export class ClinicianTaxIdentityRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifierCrypto: NationalIdentifierCryptoService,
  ) {}

  async findIdentities(doctorIds: readonly string[]): Promise<ClinicianTaxIdentityRecord[]> {
    if (doctorIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.doctorProfile.findMany({
      where: { id: { in: [...doctorIds] } },
      select: { id: true, fullName: true, profession: true, npwp: true, nikLast4: true },
    });
    return rows.map((row) => ({
      doctorId: row.id,
      fullName: row.fullName,
      profession: row.profession,
      npwp: row.npwp,
      nikLast4: row.nikLast4,
    }));
  }

  /** The full NPWP and decrypted NIK; the caller records who asked and for whom. */
  async findIdentifiers(doctorIds: readonly string[]): Promise<ClinicianTaxIdentifierRecord[]> {
    if (doctorIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.doctorProfile.findMany({
      where: { id: { in: [...doctorIds] } },
      select: { id: true, npwp: true, nikCiphertext: true },
    });
    return rows.map((row) => ({
      doctorId: row.id,
      npwp: row.npwp,
      nik:
        row.nikCiphertext === null
          ? null
          : this.identifierCrypto.decryptIdentifier(row.nikCiphertext),
    }));
  }

  /**
   * What the Coretax BP21 file needs of each clinician (P27-T08): the full
   * NPWP, else the decrypted NIK, and the PTKP status. Decrypts like
   * `findIdentifiers`; the caller audits the export that carries them.
   */
  async findCoretaxBp21Sources(
    doctorIds: readonly string[],
  ): Promise<CoretaxBp21ClinicianSource[]> {
    if (doctorIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.doctorProfile.findMany({
      where: { id: { in: [...doctorIds] } },
      select: { id: true, npwp: true, nikCiphertext: true, ptkpStatus: true },
    });
    return rows.map((row) => ({
      doctorId: row.id,
      taxIdentityNumber:
        row.npwp ??
        (row.nikCiphertext === null
          ? null
          : this.identifierCrypto.decryptIdentifier(row.nikCiphertext)),
      ptkpStatus: row.ptkpStatus,
    }));
  }
}
