import {
  DoctorSatusehatLinkTarget,
  PatientSatusehatLinkTarget,
  SaveDoctorIhsNumberPayload,
  SavePatientIhsNumberPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Persistence for SATUSEHAT linkage. This repository is the only place the
 * identifier ciphertext columns are touched: the stored NIK is decrypted here
 * for the outbound lookup, and a resolved patient IHS number is sealed here
 * before it is written — neither ciphertext nor key versions ever reach the
 * service layer.
 */
@Injectable()
export class SatusehatLinkRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: NationalIdentifierCryptoService,
  ) {}

  async findPatientLinkTarget(patientId: string): Promise<PatientSatusehatLinkTarget | null> {
    const row = await this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: { id: patientId },
      select: {
        id: true,
        nikCiphertext: true,
        satusehatPatientIdCiphertext: true,
      },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      nik: this.decryptOptional(row.nikCiphertext),
      hasSatusehatPatientId: row.satusehatPatientIdCiphertext !== null,
    };
  }

  async savePatientIhsNumber(payload: SavePatientIhsNumberPayload): Promise<void> {
    const sealed = this.cryptoService.encryptSealedIdentifier(payload.ihsNumber);
    await this.prisma.patientProfile.update({
      where: { id: payload.patientId },
      data: {
        satusehatPatientIdCiphertext: sealed.ciphertext,
        satusehatPatientIdKeyVersion: sealed.keyVersion,
      },
    });
  }

  async findDoctorLinkTarget(doctorId: string): Promise<DoctorSatusehatLinkTarget | null> {
    const row = await this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: { id: doctorId },
      select: {
        id: true,
        nikCiphertext: true,
        satusehatPractitionerId: true,
      },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      nik: this.decryptOptional(row.nikCiphertext),
      satusehatPractitionerId: row.satusehatPractitionerId,
    };
  }

  async saveDoctorIhsNumber(payload: SaveDoctorIhsNumberPayload): Promise<void> {
    await this.prisma.doctorProfile.update({
      where: { id: payload.doctorId },
      data: { satusehatPractitionerId: payload.ihsNumber },
    });
  }

  private decryptOptional(ciphertext: string | null): string | null {
    return ciphertext === null ? null : this.cryptoService.decryptIdentifier(ciphertext);
  }
}
