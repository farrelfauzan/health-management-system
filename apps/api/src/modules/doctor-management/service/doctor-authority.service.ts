import {
  CreateDoctorAuthorityInput,
  CreateDoctorAuthorityUploadUrlInput,
  DOCTOR_AUTHORITY_ALREADY_ACTIVE_ERROR_CODE,
  DOCTOR_AUTHORITY_GRANT_DOCUMENT_MAX_SIZE_BYTES,
  DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES,
  DOCTOR_AUTHORITY_REQUIRES_MIDWIFE_ERROR_CODE,
  DoctorAuthority,
  DoctorAuthorityClinicianRecord,
  DoctorAuthorityDownloadView,
  DoctorAuthorityExpiryCandidate,
  DoctorAuthorityGrantDocumentPayload,
  DoctorAuthorityRecord,
  DoctorAuthorityUploadUrlView,
  HasActiveDoctorAuthorityParams,
  RevokeDoctorAuthorityInput,
  UpdateDoctorAuthorityInput,
  UpdateDoctorAuthorityRecordPayload,
  getCalendarDateInTimeZone,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { HeadObjectResult } from '../../../common/storage/storage.types';
import { DoctorAuthorityConflictError } from '../repository/doctor-authority-conflict.error';
import { DoctorAuthorityRepository } from '../repository/doctor-authority.repository';
import { buildDoctorAuthorityGrantDocumentKeyPrefix } from './build-doctor-authority-grant-document-key-prefix';
import { isDoctorAuthorityGrantDocumentStorageKey } from './is-doctor-authority-grant-document-storage-key';
import { toDoctorAuthorityView } from './to-doctor-authority-view';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const GRANT_DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * A midwife's delegated authorities — *kewenangan* (P25-T02). Shaped by
 * D-036: the grant rests on PP 28/2024 Pasal 742–745 and Permenkes 13/2025
 * Pasal 185–187, always with a training certificate and an end date. This service is the record; P25-T03 enforces it by
 * calling {@link hasActiveAuthority}, and other modules go through this
 * class, never the repository, so "active" is resolved by one rule in one
 * calendar — the clinic's.
 */
@Injectable()
export class DoctorAuthorityService {
  private readonly logger = new Logger(DoctorAuthorityService.name);
  private readonly clinicTimeZone: string;

  constructor(
    private readonly doctorAuthorityRepository: DoctorAuthorityRepository,
    private readonly objectStorageService: ObjectStorageService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /**
   * Whether `doctorId` holds a live authority of `kind` covering `onDate`
   * (default: today in the clinic's time zone). Active means not revoked,
   * not deleted and `validFrom ≤ onDate ≤ validUntil`, both ends inclusive. The question P25-T03/T05/T14 ask.
   */
  async hasActiveAuthority(params: HasActiveDoctorAuthorityParams): Promise<boolean> {
    const onDate =
      params.onDate === undefined ? this.resolveClinicToday() : parseDateOnly(params.onDate);
    return this.doctorAuthorityRepository.hasActiveAuthority(params.doctorId, params.kind, onDate);
  }

  /** Every undeleted authority of one clinician. A profile that is not a midwife simply has none. */
  async listAuthorities(doctorId: string): Promise<DoctorAuthority[]> {
    await this.requireClinician(doctorId);
    const today = this.resolveClinicToday();
    const records = await this.doctorAuthorityRepository.listByDoctor(doctorId);
    return records.map((record) => toDoctorAuthorityView(record, today));
  }

  async createAuthority(
    doctorId: string,
    input: CreateDoctorAuthorityInput,
    actor: CurrentUser,
  ): Promise<DoctorAuthority> {
    await this.requireMidwife(doctorId);
    if (await this.doctorAuthorityRepository.hasLiveAuthority(doctorId, input.kind)) {
      throw this.buildAlreadyActiveException();
    }
    const grantDocument =
      input.grantDocumentStorageKey === undefined
        ? null
        : await this.readGrantDocumentObject(doctorId, input.grantDocumentStorageKey);
    try {
      const record = await this.doctorAuthorityRepository.create({
        doctorId,
        kind: input.kind,
        grantKind: input.grantKind,
        trainingCertificateNumber: input.trainingCertificateNumber,
        grantReference: input.grantReference,
        grantIssuedAt: parseDateOnly(input.grantIssuedAt),
        validFrom: parseDateOnly(input.validFrom),
        validUntil: parseDateOnly(input.validUntil),
        grantDocument,
        createdById: actor.sub,
      });
      return toDoctorAuthorityView(record, this.resolveClinicToday());
    } catch (err) {
      if (err instanceof DoctorAuthorityConflictError) {
        throw this.buildAlreadyActiveException();
      }
      throw err;
    }
  }

  /** Edits the evidence, the dates and the document. `kind` is not on the input type, by design. */
  async updateAuthority(
    doctorId: string,
    id: string,
    input: UpdateDoctorAuthorityInput,
  ): Promise<DoctorAuthority> {
    await this.requireMidwife(doctorId);
    const existing = await this.requireAuthority(doctorId, id);
    this.assertValidityOrder(existing, input);
    const payload = await this.toUpdatePayload(doctorId, existing, input);
    const record = await this.doctorAuthorityRepository.update(id, payload);
    await this.discardReplacedGrantDocument(existing, record);
    return toDoctorAuthorityView(record, this.resolveClinicToday());
  }

  async revokeAuthority(
    doctorId: string,
    id: string,
    input: RevokeDoctorAuthorityInput,
    actor: CurrentUser,
  ): Promise<DoctorAuthority> {
    await this.requireMidwife(doctorId);
    const existing = await this.requireAuthority(doctorId, id);
    if (existing.revokedAt !== null) {
      throw new ConflictException('This authority has already been revoked');
    }
    const record = await this.doctorAuthorityRepository.revoke(id, {
      revokedById: actor.sub,
      revokeReason: input.reason,
      revokedAt: new Date(),
    });
    return toDoctorAuthorityView(record, this.resolveClinicToday());
  }

  /**
   * Signs one browser-direct upload of a grant document under this
   * clinician's prefix. Nothing is persisted: the key is recorded only when a
   * create or update names it, and both prove it against the prefix first.
   */
  async createGrantDocumentUploadUrl(
    doctorId: string,
    input: CreateDoctorAuthorityUploadUrlInput,
  ): Promise<DoctorAuthorityUploadUrlView> {
    await this.requireMidwife(doctorId);
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: buildDoctorAuthorityGrantDocumentKeyPrefix(doctorId),
      fileExtension: GRANT_DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE[input.mimeType],
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

  async getGrantDocumentDownloadUrl(
    doctorId: string,
    id: string,
  ): Promise<DoctorAuthorityDownloadView> {
    await this.requireClinician(doctorId);
    const record = await this.requireAuthority(doctorId, id);
    if (record.grantDocumentStorageKey === null || record.grantDocumentMimeType === null) {
      throw new NotFoundException('No grant document is on file for this authority');
    }
    const signedUrl = await this.objectStorageService.getSignedUrl({
      key: record.grantDocumentStorageKey,
      responseContentDisposition: `attachment; filename="grant-document-${record.id}.${GRANT_DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE[record.grantDocumentMimeType] ?? 'bin'}"`,
      responseContentType: record.grantDocumentMimeType,
    });
    return { url: signedUrl.url, expiresAt: signedUrl.expiresAt };
  }

  /**
   * Every live authority that has reached or passed
   * `thresholdDays` before its end, with the threshold, for the reminder job.
   */
  async findAuthoritiesAtThreshold(
    thresholdDays: number,
  ): Promise<DoctorAuthorityExpiryCandidate[]> {
    const today = this.resolveClinicToday();
    const records = await this.doctorAuthorityRepository.listExpiringAuthorities(
      new Date(today.getTime() + thresholdDays * MILLISECONDS_PER_DAY),
    );
    return records.map((record) => ({
      record,
      daysUntilExpiry: Math.round(
        (record.validUntil.getTime() - today.getTime()) / MILLISECONDS_PER_DAY,
      ),
      thresholdDays,
    }));
  }

  async claimExpiryNotice(authorityId: string, thresholdDays: number): Promise<boolean> {
    return this.doctorAuthorityRepository.claimExpiryNotice(authorityId, thresholdDays);
  }

  private async requireClinician(doctorId: string): Promise<DoctorAuthorityClinicianRecord> {
    const clinician = await this.doctorAuthorityRepository.findClinicianById(doctorId);
    if (clinician === null) {
      throw new NotFoundException('Doctor not found');
    }
    return clinician;
  }

  private async requireMidwife(doctorId: string): Promise<DoctorAuthorityClinicianRecord> {
    const clinician = await this.requireClinician(doctorId);
    if (clinician.profession !== 'MIDWIFE') {
      throw new UnprocessableEntityException({
        code: DOCTOR_AUTHORITY_REQUIRES_MIDWIFE_ERROR_CODE,
        message: 'Delegated authorities can only be recorded for a midwife',
      });
    }
    return clinician;
  }

  private async requireAuthority(doctorId: string, id: string): Promise<DoctorAuthorityRecord> {
    const record = await this.doctorAuthorityRepository.findById(doctorId, id);
    if (record === null) {
      throw new NotFoundException('Authority not found');
    }
    return record;
  }

  private buildAlreadyActiveException(): ConflictException {
    return new ConflictException({
      code: DOCTOR_AUTHORITY_ALREADY_ACTIVE_ERROR_CODE,
      message: 'A live authority of this kind already exists; edit its dates or revoke it first',
    });
  }

  private assertValidityOrder(
    existing: DoctorAuthorityRecord,
    input: UpdateDoctorAuthorityInput,
  ): void {
    const validFrom =
      input.validFrom === undefined ? existing.validFrom : parseDateOnly(input.validFrom);
    const validUntil =
      input.validUntil === undefined ? existing.validUntil : parseDateOnly(input.validUntil);
    if (validUntil.getTime() < validFrom.getTime()) {
      throw new BadRequestException('validUntil must be on or after validFrom');
    }
  }

  private async toUpdatePayload(
    doctorId: string,
    existing: DoctorAuthorityRecord,
    input: UpdateDoctorAuthorityInput,
  ): Promise<UpdateDoctorAuthorityRecordPayload> {
    return {
      grantKind: input.grantKind,
      trainingCertificateNumber: input.trainingCertificateNumber,
      grantReference: input.grantReference,
      grantIssuedAt:
        input.grantIssuedAt === undefined ? undefined : parseDateOnly(input.grantIssuedAt),
      validFrom: input.validFrom === undefined ? undefined : parseDateOnly(input.validFrom),
      validUntil: input.validUntil === undefined ? undefined : parseDateOnly(input.validUntil),
      grantDocument: await this.resolveGrantDocumentChange(
        doctorId,
        existing,
        input.grantDocumentStorageKey,
      ),
    };
  }

  private async resolveGrantDocumentChange(
    doctorId: string,
    existing: DoctorAuthorityRecord,
    storageKey: string | null | undefined,
  ): Promise<DoctorAuthorityGrantDocumentPayload | null | undefined> {
    if (storageKey === undefined || storageKey === existing.grantDocumentStorageKey) {
      return undefined;
    }
    if (storageKey === null) {
      return null;
    }
    return this.readGrantDocumentObject(doctorId, storageKey);
  }

  /**
   * Proves a caller-supplied key against this clinician's prefix, then reads
   * the object back from storage rather than believing the client about what
   * was uploaded — the same order `VaultDocumentService.confirmUpload` keeps.
   */
  private async readGrantDocumentObject(
    doctorId: string,
    storageKey: string,
  ): Promise<DoctorAuthorityGrantDocumentPayload> {
    if (!isDoctorAuthorityGrantDocumentStorageKey(storageKey, doctorId)) {
      throw new BadRequestException(
        'Storage key was not issued for a grant document of this clinician',
      );
    }
    const stored = await this.headGrantDocumentObject(storageKey);
    const mimeType = stored.contentType?.split(';')[0]?.trim() ?? '';
    if (!DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES.some((allowed) => allowed === mimeType)) {
      throw new BadRequestException('Uploaded file is not a PDF or an image');
    }
    if (
      stored.sizeBytes <= 0 ||
      stored.sizeBytes > DOCTOR_AUTHORITY_GRANT_DOCUMENT_MAX_SIZE_BYTES
    ) {
      throw new BadRequestException('Uploaded file is empty or larger than the permitted size');
    }
    return { storageKey, mimeType, sizeBytes: stored.sizeBytes };
  }

  private async headGrantDocumentObject(storageKey: string): Promise<HeadObjectResult> {
    try {
      return await this.objectStorageService.headObject({ key: storageKey });
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new BadRequestException(
          'No uploaded file was found for this storage key; upload the file to the signed URL before saving',
        );
      }
      throw err;
    }
  }

  /** Best effort: a replaced or detached grant document should not linger in the bucket. */
  private async discardReplacedGrantDocument(
    before: DoctorAuthorityRecord,
    after: DoctorAuthorityRecord,
  ): Promise<void> {
    if (
      before.grantDocumentStorageKey === null ||
      before.grantDocumentStorageKey === after.grantDocumentStorageKey
    ) {
      return;
    }
    try {
      await this.objectStorageService.deleteObject({ key: before.grantDocumentStorageKey });
    } catch {
      this.logger.warn(buildSafeErrorLog('doctor_authority_grant_document_discard_failed'));
    }
  }

  /** Midnight UTC of the clinic's current calendar day, as the licence service counts it. */
  private resolveClinicToday(): Date {
    return parseDateOnly(getCalendarDateInTimeZone(new Date(), this.clinicTimeZone));
  }
}
