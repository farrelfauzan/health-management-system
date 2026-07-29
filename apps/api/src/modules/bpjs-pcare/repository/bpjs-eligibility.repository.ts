import {
  BpjsEligibilityCheckRecord,
  BpjsPatientLookupIdentifiers,
  SaveBpjsEligibilityCheckData,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BpjsEligibilityCheck } from '../../../generated/prisma/client';

/**
 * Persistence for BPJS eligibility checks. This repository is the only place
 * a patient's sealed BPJS number or NIK is decrypted for the outbound
 * peserta lookup — the plaintext exists solely inside
 * {@link findPatientLookupIdentifiers}'s return value and never reaches a
 * response, a log, or the cache table. The cache is one row per patient per
 * clinic-local day, upserted so a forced re-check replaces the day's result.
 */
@Injectable()
export class BpjsEligibilityRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly identifierCryptoService: NationalIdentifierCryptoService,
  ) {}

  async findPatientLookupIdentifiers(
    patientId: string,
  ): Promise<BpjsPatientLookupIdentifiers | null> {
    const row = await this.prismaService.findFirstActive(this.prismaService.patientProfile, {
      where: { id: patientId },
      select: { id: true, bpjsNumberCiphertext: true, nikCiphertext: true },
    });
    if (row === null) {
      return null;
    }
    return {
      patientId: row.id,
      bpjsNumber: this.decryptOptional(row.bpjsNumberCiphertext),
      nik: this.decryptOptional(row.nikCiphertext),
    };
  }

  async findCheckForDate(
    patientId: string,
    checkedDate: Date,
  ): Promise<BpjsEligibilityCheckRecord | null> {
    const row = await this.prismaService.bpjsEligibilityCheck.findUnique({
      where: { patientId_checkedDate: { patientId, checkedDate } },
    });
    return row === null ? null : this.toRecord(row);
  }

  async upsertCheck(data: SaveBpjsEligibilityCheckData): Promise<BpjsEligibilityCheckRecord> {
    const { patientId, checkedDate, ...outcomeFields } = data;
    const row = await this.prismaService.bpjsEligibilityCheck.upsert({
      where: { patientId_checkedDate: { patientId, checkedDate } },
      create: { patientId, checkedDate, ...outcomeFields },
      update: outcomeFields,
    });
    return this.toRecord(row);
  }

  private decryptOptional(ciphertext: string | null): string | null {
    return ciphertext === null ? null : this.identifierCryptoService.decryptIdentifier(ciphertext);
  }

  private toRecord(row: BpjsEligibilityCheck): BpjsEligibilityCheckRecord {
    return {
      id: row.id,
      patientId: row.patientId,
      checkedDate: row.checkedDate,
      outcome: row.outcome,
      checkedVia: row.checkedVia,
      memberName: row.memberName,
      memberType: row.memberType,
      memberClass: row.memberClass,
      providerCode: row.providerCode,
      providerName: row.providerName,
      isRegisteredHere: row.isRegisteredHere,
      isProlanis: row.isProlanis,
      isPrb: row.isPrb,
      statusReason: row.statusReason,
      checkedAt: row.checkedAt,
    };
  }
}
