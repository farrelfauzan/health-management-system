import {
  CreateDoctorAuthorityUploadUrlInput,
  CreateDoctorMandateInput,
  DOCTOR_AUTHORITY_GRANT_DOCUMENT_MAX_SIZE_BYTES,
  DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES,
  DOCTOR_MANDATE_INSTRUCTION_REQUIRED_ERROR_CODE,
  DOCTOR_MANDATE_INVALID_PARTIES_ERROR_CODE,
  DoctorAuthorityDownloadView,
  DoctorAuthorityUploadUrlView,
  DoctorMandate,
  DoctorMandateRecord,
  FindCoveringDoctorMandateParams,
  RevokeDoctorMandateInput,
  getCalendarDateInTimeZone,
} from '@hms/shared-types';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { HeadObjectResult } from '../../../common/storage/storage.types';
import { DoctorAuthorityRepository } from '../repository/doctor-authority.repository';
import { DoctorMandateRepository } from '../repository/doctor-mandate.repository';
import { buildDoctorMandateInstructionKeyPrefix } from './build-doctor-mandate-instruction-key-prefix';
import { isDoctorMandateInstructionStorageKey } from './is-doctor-mandate-instruction-storage-key';
import { toDoctorMandateView } from './to-doctor-mandate-view';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const INSTRUCTION_FILE_EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * The written pelimpahan a midwife works under (P25-T05, FR-AUTH-04).
 *
 * Shaped by D-036: Permenkes 28/2017 Pasal 27 is revoked, and PP 28/2024
 * Pasal 745 with Permenkes 13/2025 Pasal 184 replace it with **two** forms.
 * A MANDATE leaves responsibility with the doctor who supervises; a
 * DELEGATION moves it to the midwife while he is away. Which one it was is
 * therefore not an administrative detail — it is shown on every action taken
 * under it.
 *
 * This service is the record. The procedure gate asks it
 * {@link findCoveringMandate}, the same way it asks the authority service
 * whether a midwife may act on her own.
 */
@Injectable()
export class DoctorMandateService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly doctorMandateRepository: DoctorMandateRepository,
    private readonly doctorAuthorityRepository: DoctorAuthorityRepository,
    private readonly objectStorageService: ObjectStorageService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /**
   * The live mandate covering one procedure code on one day, or null. The
   * question P25-T05 adds to the gate, asked for every procedure a midwife
   * records — a mandate covers a code that needs no authority too, and the
   * card names the responsible clinician either way.
   */
  async findCoveringMandate(
    params: FindCoveringDoctorMandateParams,
  ): Promise<DoctorMandateRecord | null> {
    return this.doctorMandateRepository.findCovering(params);
  }

  async listMandates(midwifeDoctorId: string): Promise<DoctorMandate[]> {
    await this.requireClinician(midwifeDoctorId);
    const today = this.resolveClinicToday();
    const records = await this.doctorMandateRepository.listByMidwife(midwifeDoctorId);
    return Promise.all(records.map((record) => this.toView(record, today)));
  }

  async createMandate(
    midwifeDoctorId: string,
    input: CreateDoctorMandateInput,
    actor: CurrentUser,
  ): Promise<DoctorMandate> {
    await this.assertParties(midwifeDoctorId, input.mandatingDoctorId);
    const instructionDocument = await this.readInstructionObject(
      midwifeDoctorId,
      input.instructionStorageKey,
    );
    const record = await this.doctorMandateRepository.create({
      midwifeDoctorId,
      mandatingDoctorId: input.mandatingDoctorId,
      kind: input.kind,
      instruction: input.instruction,
      icd9cmCodes: input.icd9cmCodes,
      validFrom: parseDateOnly(input.validFrom),
      validUntil: parseDateOnly(input.validUntil),
      instructionDocument,
      createdById: actor.sub,
    });
    return this.toView(record, this.resolveClinicToday());
  }

  async revokeMandate(
    midwifeDoctorId: string,
    id: string,
    input: RevokeDoctorMandateInput,
    actor: CurrentUser,
  ): Promise<DoctorMandate> {
    const existing = await this.requireMandate(midwifeDoctorId, id);
    if (existing.revokedAt !== null) {
      throw new ConflictException('This mandate has already been revoked');
    }
    const record = await this.doctorMandateRepository.revoke(id, {
      revokedById: actor.sub,
      revokeReason: input.reason,
      revokedAt: new Date(),
    });
    return this.toView(record, this.resolveClinicToday());
  }

  /**
   * Signs one browser-direct upload of the written instruction under this
   * midwife's prefix. Nothing is persisted: the key is recorded only when a
   * create names it, and the create proves it against the prefix first.
   */
  async createInstructionUploadUrl(
    midwifeDoctorId: string,
    input: CreateDoctorAuthorityUploadUrlInput,
  ): Promise<DoctorAuthorityUploadUrlView> {
    await this.requireClinician(midwifeDoctorId);
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: buildDoctorMandateInstructionKeyPrefix(midwifeDoctorId),
      fileExtension: INSTRUCTION_FILE_EXTENSION_BY_MIME_TYPE[input.mimeType],
    });
    const signedUpload = await this.objectStorageService.getSignedUploadUrl({
      key: storageKey,
      contentType: input.mimeType,
      contentLengthBytes: input.sizeBytes,
    });
    return {
      url: signedUpload.url,
      storageKey: signedUpload.key,
      expiresAt: signedUpload.expiresAt,
      requiredHeaders: signedUpload.requiredHeaders,
    };
  }

  async getInstructionDownloadUrl(
    midwifeDoctorId: string,
    id: string,
  ): Promise<DoctorAuthorityDownloadView> {
    const record = await this.requireMandate(midwifeDoctorId, id);
    const signedUrl = await this.objectStorageService.getSignedUrl({
      key: record.instructionStorageKey,
      responseContentDisposition: `attachment; filename="mandate-${record.id}.${INSTRUCTION_FILE_EXTENSION_BY_MIME_TYPE[record.instructionMimeType] ?? 'bin'}"`,
      responseContentType: record.instructionMimeType,
    });
    return { url: signedUrl.url, expiresAt: signedUrl.expiresAt };
  }

  /**
   * A mandate runs between two different clinicians of the right professions:
   * the midwife must be a `MIDWIFE`, and the doctor delegating to her must be
   * an active `DOCTOR` — a bidan cannot delegate what she was delegated.
   */
  private async assertParties(midwifeDoctorId: string, mandatingDoctorId: string): Promise<void> {
    const midwife = await this.requireClinician(midwifeDoctorId);
    if (midwife.profession !== 'MIDWIFE') {
      throw this.buildInvalidPartiesException('A mandate can only be recorded for a midwife');
    }
    if (mandatingDoctorId === midwifeDoctorId) {
      throw this.buildInvalidPartiesException('A clinician can not mandate herself');
    }
    const mandatingDoctor =
      await this.doctorAuthorityRepository.findClinicianById(mandatingDoctorId);
    if (mandatingDoctor === null) {
      throw new NotFoundException('Mandating doctor not found');
    }
    if (mandatingDoctor.profession !== 'DOCTOR') {
      throw this.buildInvalidPartiesException('Only a doctor can grant a mandate');
    }
  }

  /**
   * Proves the instruction file exists in storage under this midwife's prefix
   * before the row is written. A pelimpahan is written (PP 28/2024 Pasal
   * 745(2)), so a mandate whose file cannot be read is refused rather than
   * recorded with a key pointing at nothing.
   */
  private async readInstructionObject(
    midwifeDoctorId: string,
    storageKey: string,
  ): Promise<{ storageKey: string; mimeType: string; sizeBytes: number }> {
    if (!isDoctorMandateInstructionStorageKey(storageKey, midwifeDoctorId)) {
      throw this.buildInstructionRequiredException(
        'The instruction key was not minted for this midwife',
      );
    }
    const stored = await this.headInstructionObject(storageKey);
    const mimeType = stored.contentType?.split(';')[0]?.trim() ?? '';
    if (!DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES.some((allowed) => allowed === mimeType)) {
      throw this.buildInstructionRequiredException('The written instruction is not a PDF or an image');
    }
    if (
      stored.sizeBytes <= 0 ||
      stored.sizeBytes > DOCTOR_AUTHORITY_GRANT_DOCUMENT_MAX_SIZE_BYTES
    ) {
      throw this.buildInstructionRequiredException(
        'The written instruction is empty or larger than the permitted size',
      );
    }
    return { storageKey, mimeType, sizeBytes: stored.sizeBytes };
  }

  private async headInstructionObject(storageKey: string): Promise<HeadObjectResult> {
    try {
      return await this.objectStorageService.headObject({ key: storageKey });
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw this.buildInstructionRequiredException(
          'No uploaded instruction was found for this storage key; upload it to the signed URL before saving',
        );
      }
      throw err;
    }
  }

  private async toView(record: DoctorMandateRecord, today: Date): Promise<DoctorMandate> {
    const overlappingCount = await this.doctorMandateRepository.findOverlapping({
      midwifeDoctorId: record.midwifeDoctorId,
      validFrom: record.validFrom,
      validUntil: record.validUntil,
    });
    // The row counts itself, so an overlap means a *second* live mandate.
    return toDoctorMandateView(record, today, Math.max(overlappingCount - 1, 0));
  }

  private async requireClinician(doctorId: string) {
    const clinician = await this.doctorAuthorityRepository.findClinicianById(doctorId);
    if (clinician === null) {
      throw new NotFoundException('Doctor not found');
    }
    return clinician;
  }

  private async requireMandate(
    midwifeDoctorId: string,
    id: string,
  ): Promise<DoctorMandateRecord> {
    const record = await this.doctorMandateRepository.findById(midwifeDoctorId, id);
    if (record === null) {
      throw new NotFoundException('Mandate not found');
    }
    return record;
  }

  private buildInvalidPartiesException(message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: DOCTOR_MANDATE_INVALID_PARTIES_ERROR_CODE,
      message,
    });
  }

  private buildInstructionRequiredException(message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: DOCTOR_MANDATE_INSTRUCTION_REQUIRED_ERROR_CODE,
      message,
    });
  }

  private resolveClinicToday(): Date {
    return parseDateOnly(getCalendarDateInTimeZone(new Date(), this.clinicTimeZone));
  }
}
