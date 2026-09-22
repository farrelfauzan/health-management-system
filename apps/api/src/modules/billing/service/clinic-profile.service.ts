import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  CLINIC_LOGO_MAX_EDGE_PIXELS,
  CLINIC_LOGO_MAX_UPLOAD_SIZE_BYTES,
  CLINIC_LOGO_STORED_MIME_TYPE,
  CLINIC_NPWP_INVALID_ERROR_CODE,
  ClinicLetterhead,
  ClinicLogoUploadUrlView,
  ClinicProfileRecord,
  ClinicProfileView,
  ClinicReportingIdentity,
  CreateClinicLogoUploadUrlInput,
  SaveClinicProfileData,
  UpdateClinicProfileInput,
  resolveTaxIdChange,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { reencodeImage } from '../../../common/image/reencode-image';
import { validateImageContent } from '../../../common/image/validate-image-content';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { ClinicProfileRepository } from '../repository/clinic-profile.repository';
import { toClinicProfileView } from './clinic-profile.mapper';
import {
  CLINIC_LOGO_STAGED_KEY_PREFIX,
  CLINIC_LOGO_STORED_KEY_PREFIX,
} from './clinic-logo-storage-key-prefix';
import { isStagedClinicLogoStorageKey } from './is-clinic-logo-storage-key';

const DEFAULT_CLINIC_LABEL = 'Saling Jaga';

const CLINIC_PROFILE_AUDIT_RESOURCE = 'clinic-profile';
const LOGO_FILE_EXTENSION = 'png';
/**
 * `attachment`, even though the admin form and the invoice renderer both
 * display this image. Browsers ignore `Content-Disposition` on a subresource
 * load, so `<img src>` renders normally — what the header changes is what
 * happens when somebody *navigates* to the URL, and there it means the file
 * downloads instead of rendering in a tab. Combined with the pinned content
 * type, that is `docs/security/file-uploads.md` §5's inert-serving rule: the
 * storage origin never renders a stored file, whatever it turns out to be.
 */
const LOGO_DOWNLOAD_DISPOSITION = 'attachment; filename="clinic-logo.png"';

/**
 * The clinic's own identity (P16-T02) — one row, read by anyone who prints
 * something on the clinic's behalf and written by administrators.
 *
 * The logo is the part with teeth. Uploads are browser-direct presigned PUTs
 * like every other surface, so the bytes land in the bucket before this
 * process has seen one of them; what makes the stored object trustworthy is
 * that it is never the uploaded object. The PUT goes to a `staged/` key, and
 * the PATCH that claims it decodes those bytes and writes a fresh PNG to a
 * `stored/` key of this service's own minting. Only `stored/` keys ever reach
 * the row, so the image an invoice embeds is always one this process
 * produced — EXIF gone, polyglots destroyed, dimensions bounded.
 */
@Injectable()
export class ClinicProfileService {
  private readonly logger = new Logger(ClinicProfileService.name);

  constructor(
    private readonly clinicProfileRepository: ClinicProfileRepository,
    private readonly objectStorageService: ObjectStorageService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Reads the profile, 404ing until it is configured. A 404 rather than an
   * empty object on purpose: "the clinic has not been set up" and "the clinic
   * is called nothing" are different facts, and only the first has an action
   * attached to it.
   */
  /**
   * The name a message names the clinic by (`P16-T26`, FR-E4-15). Cheap on
   * purpose — no signed logo URL — because it is read once per send. Falls
   * back to the product label on a deployment that has not set up its
   * profile yet, so a bill is never sent from "".
   */
  async getClinicName(): Promise<string> {
    const record = await this.clinicProfileRepository.findProfile();
    const name = record?.name.trim() ?? '';
    return name === '' ? DEFAULT_CLINIC_LABEL : name;
  }

  /**
   * The NPWP as stored, for the tax profile (P27-T02) — which shows it and
   * checks the NITKU against it but does not own it. `null` before the profile
   * exists. Cheap on purpose, like `getClinicName`: no signed logo URL.
   */
  async getTaxId(): Promise<string | null> {
    const record = await this.clinicProfileRepository.findProfile();
    return record?.taxId ?? null;
  }

  /**
   * The clinic as a document header prints it (P27-T12), logo inlined as a
   * `data:` URI because the PDF renderer has no network. An unreadable logo
   * prints without it rather than failing the document; an unconfigured
   * clinic prints under the product label.
   */
  async getLetterhead(): Promise<ClinicLetterhead> {
    const record = await this.clinicProfileRepository.findProfile();
    if (record === null) {
      return {
        name: DEFAULT_CLINIC_LABEL,
        legalName: null,
        address: null,
        taxId: null,
        logoDataUri: null,
      };
    }
    return {
      name: record.name.trim() === '' ? DEFAULT_CLINIC_LABEL : record.name,
      legalName: record.legalName,
      address: record.address,
      taxId: record.taxId,
      logoDataUri: await this.readLogoDataUri(record),
    };
  }

  /**
   * The clinic and its reporting puskesmas for a KIA report header (P25-T15).
   * An unconfigured clinic prints under the product label with no puskesmas,
   * so the register can still be printed on day one.
   */
  async getReportingIdentity(): Promise<ClinicReportingIdentity> {
    const record = await this.clinicProfileRepository.findProfile();
    const name = record?.name.trim() ?? '';
    return {
      clinicName: name === '' ? DEFAULT_CLINIC_LABEL : name,
      puskesmasName: record?.reportingPuskesmasName ?? null,
      puskesmasCode: record?.reportingPuskesmasCode ?? null,
      address: record?.address ?? null,
      phoneNumber: record?.phoneNumber ?? null,
    };
  }

  async getProfile(): Promise<ClinicProfileView> {
    const record = await this.clinicProfileRepository.findProfile();
    if (record === null) {
      throw new NotFoundException('The clinic profile has not been configured yet');
    }
    return this.toViewWithSignedLogo(record);
  }

  /**
   * Signs one browser-direct logo upload. Nothing is persisted and nothing on
   * the profile changes: a signed URL nobody claims leaves a staged object
   * that no row points at, exactly as an unconfirmed document upload does.
   */
  async createLogoUploadUrl(
    input: CreateClinicLogoUploadUrlInput,
  ): Promise<ClinicLogoUploadUrlView> {
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: CLINIC_LOGO_STAGED_KEY_PREFIX,
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

  async updateProfile(
    input: UpdateClinicProfileInput,
    actor: CurrentUser,
  ): Promise<ClinicProfileView> {
    const existing = await this.clinicProfileRepository.findProfile();
    // Only the first save can demand a name, and only the service knows
    // whether this is one — which is why the schema leaves every field
    // optional instead of pretending the requirement is a shape. Checked
    // before the logo is re-encoded, so a rejected first save does not leave
    // a stored object behind that no row will ever point at.
    if (existing === null && input.name === undefined) {
      throw new BadRequestException('name is required when the clinic profile is first created');
    }
    // Before the logo too: a refused NPWP must not leave a re-encoded logo
    // behind that no row will ever point at.
    const profileFields = this.toProfileFields(input, existing);
    const logoChange = await this.resolveLogoChange(input, actor);
    const data: SaveClinicProfileData = { ...profileFields, ...logoChange };
    const saved = await this.saveProfile(existing, data);
    // After the write, not before: a logo deleted first and a write that then
    // failed would leave the profile pointing at bytes that no longer exist.
    await this.discardReplacedLogo(existing, saved);
    await this.auditService.record({
      action: 'UPDATE',
      resource: CLINIC_PROFILE_AUDIT_RESOURCE,
      resourceId: saved.id,
      actorUserId: actor.sub,
      // Field names, never values. Which fields an administrator touched is
      // what an investigator asks; the clinic's own address is already
      // readable to anyone who can read this row.
      metadata: { changedFields: Object.keys(data).sort(), wasCreated: existing === null },
    });
    return this.toViewWithSignedLogo(saved);
  }

  /**
   * Creates the singleton on first save, updates it afterwards. Split out so
   * the name requirement narrows to a `string` where the row is created,
   * rather than being asserted away at the call site.
   */
  private async saveProfile(
    existing: ClinicProfileRecord | null,
    data: SaveClinicProfileData,
  ): Promise<ClinicProfileRecord> {
    if (existing !== null) {
      return this.clinicProfileRepository.updateProfile(existing.id, data);
    }
    const name = data.name;
    if (name === undefined) {
      throw new BadRequestException('name is required when the clinic profile is first created');
    }
    return this.clinicProfileRepository.createProfile({ ...data, name });
  }

  /**
   * Turns the three states of `logoStorageKey` into the columns to write:
   * absent leaves both alone, `null` clears them, and a key is promoted from
   * staged bytes to a re-encoded stored object first.
   */
  private async resolveLogoChange(
    input: UpdateClinicProfileInput,
    actor: CurrentUser,
  ): Promise<SaveClinicProfileData> {
    if (input.logoStorageKey === undefined) {
      return {};
    }
    if (input.logoStorageKey === null) {
      return { logoStorageKey: null, logoMimeType: null };
    }
    const storedKey = await this.storeReencodedLogo(input.logoStorageKey, actor);
    return { logoStorageKey: storedKey, logoMimeType: CLINIC_LOGO_STORED_MIME_TYPE };
  }

  /**
   * The confirm-time gate (SJ-21). Reads the staged object, refuses bytes
   * that disagree with the type its signed upload declared, re-encodes what
   * survives, and writes the result under a key of this service's own
   * minting. The staged object is deleted either way — accepted, because
   * nothing should reference it again; rejected, because a rejected upload
   * must leave nothing behind for a retried claim to eventually be believed.
   */
  private async storeReencodedLogo(stagedKey: string, actor: CurrentUser): Promise<string> {
    if (!isStagedClinicLogoStorageKey(stagedKey)) {
      throw new BadRequestException('Storage key was not issued for a clinic logo upload');
    }
    const stagedObject = await this.readStagedObject(stagedKey);
    const verdict = validateImageContent({
      content: stagedObject.body,
      declaredMimeType: stagedObject.contentType ?? '',
    });
    if (!verdict.isAccepted) {
      await this.rejectStagedLogo(stagedKey, stagedObject.contentType ?? '', verdict.reason, actor);
    }
    const reencoded = await reencodeImage({
      content: stagedObject.body,
      format: 'png',
      maxEdgePixels: CLINIC_LOGO_MAX_EDGE_PIXELS,
    });
    const storedKey = this.objectStorageService.generateObjectKey({
      keyPrefix: CLINIC_LOGO_STORED_KEY_PREFIX,
      fileExtension: LOGO_FILE_EXTENSION,
    });
    await this.objectStorageService.uploadObject({
      key: storedKey,
      body: Buffer.from(reencoded.content),
      contentType: CLINIC_LOGO_STORED_MIME_TYPE,
    });
    await this.objectStorageService.deleteObject({ key: stagedKey });
    return storedKey;
  }

  private async readStagedObject(
    stagedKey: string,
  ): Promise<{ body: Uint8Array; contentType?: string }> {
    const metadata = await this.objectStorageService.headObject({ key: stagedKey });
    if (metadata.sizeBytes <= 0) {
      throw new BadRequestException('Uploaded logo is empty');
    }
    // Re-checked against the stored object rather than trusted from the
    // signing call: the size that was signed bounds the PUT, but this is the
    // number that decides how many bytes the decoder is handed.
    if (metadata.sizeBytes > CLINIC_LOGO_MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException('Uploaded logo is larger than the permitted size');
    }
    const storedObject = await this.objectStorageService.getObject({ key: stagedKey });
    return { body: storedObject.body, contentType: storedObject.contentType };
  }

  private async rejectStagedLogo(
    stagedKey: string,
    declaredMimeType: string,
    reason: string,
    actor: CurrentUser,
  ): Promise<never> {
    await this.objectStorageService.deleteObject({ key: stagedKey });
    await this.auditService.record({
      // The same verb the document store writes, deliberately: the question
      // afterwards is "which account keeps uploading forged files", and an
      // answer split across one row type per upload surface does not count.
      action: 'DOCUMENT_UPLOAD_REJECTED',
      resource: CLINIC_PROFILE_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      metadata: { storageKey: stagedKey, declaredMimeType, reason },
    });
    this.logger.warn(`Rejected uploaded clinic logo ${stagedKey}: ${reason}`);
    throw new BadRequestException(reason);
  }

  /**
   * Deletes the object the previous logo pointed at once a new one — or none
   * — is recorded. Best-effort by design: an orphaned object costs storage,
   * while a failed delete that propagated would fail a save that has already
   * committed and tell the administrator their change did not happen.
   */
  private async discardReplacedLogo(
    previous: ClinicProfileRecord | null,
    saved: ClinicProfileRecord,
  ): Promise<void> {
    const previousKey = previous?.logoStorageKey ?? null;
    if (previousKey === null || previousKey === saved.logoStorageKey) {
      return;
    }
    try {
      await this.objectStorageService.deleteObject({ key: previousKey });
    } catch {
      this.logger.warn(`Replaced clinic logo ${previousKey} could not be deleted`);
    }
  }

  private toProfileFields(
    input: UpdateClinicProfileInput,
    existing: ClinicProfileRecord | null,
  ): SaveClinicProfileData {
    const fields: SaveClinicProfileData = {};
    if (input.name !== undefined) {
      fields.name = input.name;
    }
    if (input.legalName !== undefined) {
      fields.legalName = input.legalName;
    }
    if (input.address !== undefined) {
      fields.address = input.address;
    }
    if (input.phoneNumber !== undefined) {
      fields.phoneNumber = input.phoneNumber;
    }
    if (input.email !== undefined) {
      fields.email = input.email;
    }
    if (input.licenseNumber !== undefined) {
      fields.licenseNumber = input.licenseNumber;
    }
    Object.assign(fields, this.resolveTaxIdField(input.taxId, existing?.taxId ?? null));
    if (input.reportingPuskesmasName !== undefined) {
      fields.reportingPuskesmasName = input.reportingPuskesmasName;
    }
    if (input.reportingPuskesmasCode !== undefined) {
      fields.reportingPuskesmasCode = input.reportingPuskesmasCode;
    }
    // The schema only lets the coordinates through as a pair (P24-T05).
    if (input.latitude !== undefined) {
      fields.latitude = input.latitude;
    }
    if (input.longitude !== undefined) {
      fields.longitude = input.longitude;
    }
    return fields;
  }

  /**
   * The NPWP rule of P27-T02 (D-038): a new value must be the 16 digits
   * Coretax uses, while the value already stored — however punctuated, even
   * 15 digits — passes untouched, because the form resends every field and an
   * old identifier must never block an unrelated edit.
   */
  private resolveTaxIdField(
    requested: string | null | undefined,
    stored: string | null,
  ): SaveClinicProfileData {
    const change = resolveTaxIdChange({ requested, stored });
    if (change.kind === 'invalid') {
      throw new BadRequestException({
        code: CLINIC_NPWP_INVALID_ERROR_CODE,
        message: change.reason,
        errors: { taxId: change.reason },
      });
    }
    if (change.kind === 'cleared') {
      return { taxId: null };
    }
    return change.kind === 'set' ? { taxId: change.value } : {};
  }

  private async toViewWithSignedLogo(record: ClinicProfileRecord): Promise<ClinicProfileView> {
    if (record.logoStorageKey === null) {
      return toClinicProfileView(record);
    }
    const signed = await this.objectStorageService.getSignedUrl({
      key: record.logoStorageKey,
      responseContentDisposition: LOGO_DOWNLOAD_DISPOSITION,
      responseContentType: record.logoMimeType ?? CLINIC_LOGO_STORED_MIME_TYPE,
    });
    return toClinicProfileView(record, signed.url);
  }

  private async readLogoDataUri(record: ClinicProfileRecord): Promise<string | null> {
    if (record.logoStorageKey === null) {
      return null;
    }
    try {
      const stored = await this.objectStorageService.getObject({ key: record.logoStorageKey });
      const mimeType = record.logoMimeType ?? stored.contentType ?? CLINIC_LOGO_STORED_MIME_TYPE;
      return `data:${mimeType};base64,${stored.body.toString('base64')}`;
    } catch {
      this.logger.warn(
        buildSafeErrorLog('clinic_letterhead_logo_unreadable', { key: record.logoStorageKey }),
      );
      return null;
    }
  }
}
