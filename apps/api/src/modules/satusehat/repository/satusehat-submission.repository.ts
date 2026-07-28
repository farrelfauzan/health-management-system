import {
  MarkSubmissionFailedPayload,
  MarkSubmissionRetryPayload,
  SatusehatSubmissionBundleData,
  SatusehatSubmissionDispenseItem,
  SatusehatSubmissionMedication,
  SatusehatSubmissionPrescription,
  SatusehatSubmissionRecord,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const MEDICATION_SELECT = {
  select: { id: true, code: true, kfaCode: true, name: true, unit: true },
} as const;

type MedicationRow = {
  id: string;
  code: string;
  kfaCode: string | null;
  name: string;
  unit: string | null;
};

type PrescriptionRow = {
  id: string;
  issuedAt: Date | null;
  items: Array<{
    id: string;
    dosage: string;
    frequency: string;
    instructions: string | null;
    quantity: number;
    medication: MedicationRow;
  }>;
  dispenseRecords: Array<{
    id: string;
    dispensedAt: Date;
    items: Array<{ id: string; quantity: number; medication: MedicationRow }>;
  }>;
};

/**
 * Persistence for the SATUSEHAT submission outbox. Rows are created by the
 * EMR close transaction; this repository owns claiming due work, recording
 * outcomes, and assembling the bundle data — including decrypting the sealed
 * patient IHS number, which must never leave the repository as ciphertext.
 */
@Injectable()
export class SatusehatSubmissionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: NationalIdentifierCryptoService,
  ) {}

  async findDueSubmissions(limit: number): Promise<SatusehatSubmissionRecord[]> {
    return this.prisma.satusehatSubmission.findMany({
      where: {
        status: 'PENDING',
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
    });
  }

  async findBundleData(encounterId: string): Promise<SatusehatSubmissionBundleData | null> {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        registration: { select: { checkedInAt: true } },
        patient: {
          select: { id: true, fullName: true, satusehatPatientIdCiphertext: true },
        },
        doctor: { select: { id: true, fullName: true, satusehatPractitionerId: true } },
        diagnoses: {
          where: { deletedAt: null },
          orderBy: { recordedAt: 'asc' },
          select: { code: true, display: true, type: true, recordedAt: true },
        },
        vitalSigns: {
          where: { deletedAt: null },
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
        prescriptions: {
          where: {
            deletedAt: null,
            status: { in: ['ISSUED', 'PARTIALLY_DISPENSED', 'DISPENSED'] },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            issuedAt: true,
            items: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                dosage: true,
                frequency: true,
                instructions: true,
                quantity: true,
                medication: MEDICATION_SELECT,
              },
            },
            dispenseRecords: {
              where: { status: 'DISPENSED' },
              orderBy: { dispensedAt: 'asc' },
              select: {
                id: true,
                dispensedAt: true,
                items: {
                  orderBy: { createdAt: 'asc' },
                  select: { id: true, quantity: true, medication: MEDICATION_SELECT },
                },
              },
            },
          },
        },
      },
    });
    if (!encounter) {
      return null;
    }
    const latestVitals = encounter.vitalSigns[0];
    return {
      encounterId: encounter.id,
      encounterStatus: encounter.status,
      patientId: encounter.patient.id,
      patientName: encounter.patient.fullName,
      patientIhsNumber: this.decryptOptional(encounter.patient.satusehatPatientIdCiphertext),
      doctorId: encounter.doctor.id,
      doctorName: encounter.doctor.fullName,
      practitionerIhsNumber: encounter.doctor.satusehatPractitionerId,
      arrivedAt: encounter.registration.checkedInAt ?? encounter.startedAt,
      startedAt: encounter.startedAt,
      endedAt: encounter.endedAt,
      diagnoses: encounter.diagnoses,
      latestVitalSigns: latestVitals
        ? {
            recordedAt: latestVitals.recordedAt,
            heightCm: this.toNumberOrNull(latestVitals.heightCm),
            weightKg: this.toNumberOrNull(latestVitals.weightKg),
            systolicBloodPressure: latestVitals.systolicBloodPressure,
            diastolicBloodPressure: latestVitals.diastolicBloodPressure,
            pulseRate: latestVitals.pulseRate,
            respiratoryRate: latestVitals.respiratoryRate,
            temperatureCelsius: this.toNumberOrNull(latestVitals.temperatureCelsius),
            oxygenSaturation: latestVitals.oxygenSaturation,
          }
        : null,
      prescriptions: encounter.prescriptions.map((prescription) =>
        this.toSubmissionPrescription(prescription),
      ),
      dispenseItems: encounter.prescriptions.flatMap((prescription) =>
        this.toSubmissionDispenseItems(prescription),
      ),
    };
  }

  private toSubmissionPrescription(prescription: PrescriptionRow): SatusehatSubmissionPrescription {
    return {
      prescriptionId: prescription.id,
      issuedAt: prescription.issuedAt,
      items: prescription.items.map((item) => ({
        prescriptionItemId: item.id,
        prescriptionId: prescription.id,
        medication: this.toSubmissionMedication(item.medication),
        dosage: item.dosage,
        frequency: item.frequency,
        instructions: item.instructions,
        quantity: item.quantity,
      })),
    };
  }

  private toSubmissionDispenseItems(
    prescription: PrescriptionRow,
  ): SatusehatSubmissionDispenseItem[] {
    return prescription.dispenseRecords.flatMap((dispenseRecord) =>
      dispenseRecord.items.map((item) => ({
        dispenseItemId: item.id,
        dispenseRecordId: dispenseRecord.id,
        prescriptionId: prescription.id,
        medication: this.toSubmissionMedication(item.medication),
        quantity: item.quantity,
        dispensedAt: dispenseRecord.dispensedAt,
      })),
    );
  }

  private toSubmissionMedication(medication: MedicationRow): SatusehatSubmissionMedication {
    return {
      medicationId: medication.id,
      code: medication.code,
      kfaCode: medication.kfaCode,
      name: medication.name,
      unit: medication.unit,
    };
  }

  async markSubmitted(id: string, satusehatEncounterId: string | null): Promise<void> {
    const now = new Date();
    await this.prisma.satusehatSubmission.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedAt: now,
        lastAttemptAt: now,
        attempts: { increment: 1 },
        lastError: null,
        satusehatEncounterId,
      },
    });
  }

  async scheduleRetry(payload: MarkSubmissionRetryPayload): Promise<void> {
    await this.prisma.satusehatSubmission.update({
      where: { id: payload.id },
      data: {
        status: 'PENDING',
        attempts: payload.attempts,
        nextAttemptAt: payload.nextAttemptAt,
        lastAttemptAt: new Date(),
        lastError: payload.lastError,
      },
    });
  }

  async markFailed(payload: MarkSubmissionFailedPayload): Promise<void> {
    await this.prisma.satusehatSubmission.update({
      where: { id: payload.id },
      data: {
        status: 'FAILED',
        attempts: payload.attempts,
        lastAttemptAt: new Date(),
        lastError: payload.lastError,
      },
    });
  }

  private decryptOptional(ciphertext: string | null): string | null {
    return ciphertext === null ? null : this.cryptoService.decryptIdentifier(ciphertext);
  }

  /** `Decimal` measurements become numbers here so no Prisma type escapes the repository. */
  private toNumberOrNull(value: unknown): number | null {
    return value === null || value === undefined ? null : Number(value);
  }
}
