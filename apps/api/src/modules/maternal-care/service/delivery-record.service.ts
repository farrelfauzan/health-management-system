import {
  DeliveryRecordView,
  MaternalDocumentResponse,
  NewbornCareView,
  RecordDeliveryInput,
  RecordNewbornCareInput,
  UpdateDeliveryInput,
  UpdateNewbornCareInput,
} from '@hms/shared-types';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicalRequestDocumentService } from '../../clinical-request-document/service/clinical-request-document.service';
import { EncounterAccessService } from '../../emr/service/encounter-access.service';
import { DeliveryRecordRepository } from '../repository/delivery-record.repository';
import { MaternalCareRepository } from '../repository/maternal-care.repository';
import { buildBirthCertificateValues } from './build-birth-certificate-values';

export const MIDWIFE_DELIVERY_MODE_OUT_OF_AUTHORITY_ERROR_CODE =
  'MIDWIFE_DELIVERY_MODE_OUT_OF_AUTHORITY';
export const DELIVERY_REFERRAL_REQUIRED_ERROR_CODE = 'DELIVERY_REFERRAL_REQUIRED';

/** The tear grades a clinic may not simply record and move on from. */
const TEAR_GRADES_REQUIRING_REFERRAL: readonly string[] = ['GRADE_3', 'GRADE_4'];

/**
 * The birth itself (P25-T09, FR-INC-01/03/05).
 *
 * Two rules live here and nowhere else, and they point in opposite
 * directions on purpose:
 *
 * - **A midwife may only record a spontaneous vaginal birth.** Claiming a
 *   caesarean or an assisted delivery is claiming an authority she does not
 *   have, and the record would say a midwife did something only a doctor may.
 * - **A grade 3 or 4 tear is recorded, never refused.** It happens, and a
 *   record that would not accept it is a record that gets falsified. What it
 *   must not do is stand as though the clinic handled it alone, so it obliges
 *   a referral.
 *
 * Recording what happened is never blocked. Only claiming an out-of-authority
 * *mode* is.
 */
@Injectable()
export class DeliveryRecordService {
  constructor(
    private readonly deliveryRecordRepository: DeliveryRecordRepository,
    private readonly maternalCareRepository: MaternalCareRepository,
    private readonly encounterAccessService: EncounterAccessService,
    private readonly clinicalRequestDocumentService: ClinicalRequestDocumentService,
    private readonly auditService: AuditService,
  ) {}

  async getDelivery(
    pregnancyEpisodeId: string,
    currentUser: CurrentUser,
  ): Promise<DeliveryRecordView | null> {
    await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'read');
    const delivery = await this.deliveryRecordRepository.findByEpisodeId(pregnancyEpisodeId);
    return delivery === null ? null : this.toDeliveryView(delivery);
  }

  async recordDelivery(
    pregnancyEpisodeId: string,
    payload: RecordDeliveryInput,
    currentUser: CurrentUser,
  ): Promise<DeliveryRecordView> {
    await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const episode = await this.maternalCareRepository.findEpisodeById(pregnancyEpisodeId);
    if (episode === null) {
      throw new NotFoundException('Pregnancy episode not found');
    }
    await this.assertModeWithinAuthority(payload.mode, payload.attendantDoctorId);
    this.assertSevereTearIsReferred(payload.perinealTearGrade, payload.referredOut);
    const delivery = await this.deliveryRecordRepository.createDelivery({
      pregnancyEpisodeId,
      attendantDoctorId: payload.attendantDoctorId,
      admissionId: payload.admissionId ?? null,
      labourOnsetAt: this.toInstantOrNull(payload.labourOnsetAt),
      fullDilatationAt: this.toInstantOrNull(payload.fullDilatationAt),
      birthAt: new Date(payload.birthAt),
      placentaDeliveredAt: this.toInstantOrNull(payload.placentaDeliveredAt),
      postpartumMonitoringEndedAt: this.toInstantOrNull(payload.postpartumMonitoringEndedAt),
      mode: payload.mode,
      episiotomy: payload.episiotomy,
      perinealTearGrade: payload.perinealTearGrade,
      uterotonicMedicationId: payload.uterotonicMedicationId ?? null,
      uterotonicGivenAt: this.toInstantOrNull(payload.uterotonicGivenAt),
      bloodLossMl: payload.bloodLossMl ?? null,
      placentaComplete: payload.placentaComplete ?? null,
      referredOut: payload.referredOut,
      referralReason: payload.referralReason ?? null,
      notes: payload.notes ?? null,
      recordedById: currentUser.sub,
    });
    await this.auditService.record({
      action: 'DELIVERY_RECORDED',
      resource: 'DeliveryRecord',
      resourceId: delivery.id,
      actorUserId: currentUser.sub,
      patientId: episode.patientId,
      metadata: { pregnancyEpisodeId, mode: payload.mode },
    });

    return this.toDeliveryView(delivery);
  }

  async updateDelivery(
    deliveryRecordId: string,
    payload: UpdateDeliveryInput,
    currentUser: CurrentUser,
  ): Promise<DeliveryRecordView> {
    await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const existing = await this.deliveryRecordRepository.findById(deliveryRecordId);
    if (existing === null) {
      throw new NotFoundException('Delivery record not found');
    }
    const mode = payload.mode ?? existing.mode;
    const attendantDoctorId = payload.attendantDoctorId ?? existing.attendantDoctorId;
    await this.assertModeWithinAuthority(mode, attendantDoctorId);
    this.assertSevereTearIsReferred(
      payload.perinealTearGrade ?? existing.perinealTearGrade,
      payload.referredOut ?? existing.referredOut,
    );
    const delivery = await this.deliveryRecordRepository.updateDelivery(deliveryRecordId, payload);
    await this.auditService.record({
      action: 'DELIVERY_UPDATED',
      resource: 'DeliveryRecord',
      resourceId: deliveryRecordId,
      actorUserId: currentUser.sub,
      metadata: { changedFields: Object.keys(payload) },
    });

    return this.toDeliveryView(delivery);
  }

  async recordNewborn(
    deliveryRecordId: string,
    payload: RecordNewbornCareInput,
    currentUser: CurrentUser,
  ): Promise<NewbornCareView> {
    await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const delivery = await this.deliveryRecordRepository.findById(deliveryRecordId);
    if (delivery === null) {
      throw new NotFoundException('Delivery record not found');
    }
    await this.assertBirthOrderIsFree(deliveryRecordId, payload);
    const newborn = await this.deliveryRecordRepository.createNewborn(deliveryRecordId, payload);
    await this.auditService.record({
      action: 'DELIVERY_UPDATED',
      resource: 'NewbornCareRecord',
      resourceId: newborn.id,
      actorUserId: currentUser.sub,
      metadata: { deliveryRecordId, outcome: payload.outcome },
    });

    return this.toNewbornView(newborn);
  }

  async updateNewborn(
    newbornCareRecordId: string,
    payload: UpdateNewbornCareInput,
    currentUser: CurrentUser,
  ): Promise<NewbornCareView> {
    await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const existing = await this.deliveryRecordRepository.findNewbornById(newbornCareRecordId);
    if (existing === null) {
      throw new NotFoundException('Newborn care record not found');
    }
    const newborn = await this.deliveryRecordRepository.updateNewborn(
      newbornCareRecordId,
      payload,
    );
    await this.auditService.record({
      action: 'DELIVERY_UPDATED',
      resource: 'NewbornCareRecord',
      resourceId: newbornCareRecordId,
      actorUserId: currentUser.sub,
      metadata: { changedFields: Object.keys(payload) },
    });

    return this.toNewbornView(newborn);
  }

  /**
   * The surat keterangan lahir, filed on the **baby** (FR-INC-05).
   *
   * Refused for a stillbirth: what that family needs is a surat keterangan
   * kematian, which is a different document with a different legal effect, and
   * issuing a birth certificate for a baby who did not live would be wrong in
   * a way nobody could later correct. Refused too for a live baby with no
   * patient record yet, because there is nobody to file it on.
   */
  async issueBirthCertificate(
    newbornCareRecordId: string,
    currentUser: CurrentUser,
  ): Promise<MaternalDocumentResponse> {
    await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const newborn = await this.deliveryRecordRepository.findNewbornById(newbornCareRecordId);
    if (newborn === null) {
      throw new NotFoundException('Newborn care record not found');
    }
    if (newborn.outcome !== 'LIVE_BIRTH') {
      throw new UnprocessableEntityException({
        code: 'BIRTH_CERTIFICATE_LIVE_BIRTH_ONLY',
        message: 'A surat keterangan lahir is issued for a live birth only',
      });
    }
    if (newborn.newbornPatientId === null) {
      throw new UnprocessableEntityException({
        code: 'NEWBORN_NOT_REGISTERED',
        message: 'Register the baby as a patient before issuing her birth certificate',
      });
    }
    const mother = await this.maternalCareRepository.findLetterPatient(
      newborn.deliveryRecord.pregnancyEpisode.patientId,
    );
    if (mother === null) {
      throw new NotFoundException('Patient not found');
    }
    const filed = await this.clinicalRequestDocumentService.renderAndFile(
      {
        kind: 'BIRTH_CERTIFICATE',
        subjectId: newborn.id,
        // Filed on the baby, not the mother: it is her document, and it is
        // what her family is asked for at the dukcapil counter.
        patientId: newborn.newbornPatientId,
        encounterId: null,
        title: `Surat Keterangan Lahir — ${newborn.newbornPatient?.fullName ?? mother.fullName}`,
        values: buildBirthCertificateValues({
          motherName: mother.fullName,
          motherNikLast4: mother.nikLast4,
          babyName: newborn.newbornPatient?.fullName ?? null,
          sex: newborn.sex,
          birthAt: newborn.deliveryRecord.birthAt,
          birthWeightGrams: newborn.birthWeightGrams,
          lengthCm: newborn.lengthCm === null ? null : Number(newborn.lengthCm),
          birthOrder: newborn.newbornPatient?.birthOrder ?? null,
          attendantName: newborn.deliveryRecord.attendantDoctor.fullName,
          attendantStrNumber:
            newborn.deliveryRecord.attendantDoctor.licenses[0]?.licenseNumber ?? null,
        }),
        lines: [],
      },
      currentUser.sub,
    );

    return {
      documentId: filed.documentId,
      kind: 'BIRTH_CERTIFICATE',
      title: filed.title,
      renderedAt: filed.renderedAt,
    };
  }

  private async assertModeWithinAuthority(mode: string, attendantDoctorId: string): Promise<void> {
    const attendant = await this.deliveryRecordRepository.findAttendant(attendantDoctorId);
    if (attendant === null) {
      throw new NotFoundException('Attendant clinician not found');
    }
    if (attendant.profession !== 'MIDWIFE' || mode === 'SPONTANEOUS_VAGINAL') {
      return;
    }
    throw new UnprocessableEntityException({
      code: MIDWIFE_DELIVERY_MODE_OUT_OF_AUTHORITY_ERROR_CODE,
      message:
        'A midwife may record a spontaneous vaginal birth only; name the doctor who attended this one',
      errors: { mode },
    });
  }

  private assertSevereTearIsReferred(grade: string, referredOut: boolean): void {
    if (!TEAR_GRADES_REQUIRING_REFERRAL.includes(grade) || referredOut) {
      return;
    }
    throw new UnprocessableEntityException({
      code: DELIVERY_REFERRAL_REQUIRED_ERROR_CODE,
      message: 'A grade 3 or 4 perineal tear must be referred on; record where she was sent',
      errors: { perinealTearGrade: grade },
    });
  }

  /**
   * Two babies of one birth cannot share a position, whichever column holds
   * it. The database enforces it for stillbirths and for registered patients
   * separately; what it cannot see is a stillborn second twin colliding with a
   * live first one, because those live in different tables.
   */
  private async assertBirthOrderIsFree(
    deliveryRecordId: string,
    payload: RecordNewbornCareInput,
  ): Promise<void> {
    if (!payload.stillbirthOrder) {
      return;
    }
    const taken = await this.deliveryRecordRepository.listTakenBirthOrders(deliveryRecordId);
    if (!taken.includes(payload.stillbirthOrder)) {
      return;
    }
    throw new UnprocessableEntityException({
      code: 'NEWBORN_BIRTH_ORDER_TAKEN',
      message: 'Another baby of this birth already holds that position',
      errors: { stillbirthOrder: String(payload.stillbirthOrder) },
    });
  }

  private toDeliveryView(delivery: {
    id: string;
    pregnancyEpisodeId: string;
    admissionId: string | null;
    attendantDoctorId: string;
    attendantDoctor: { fullName: string };
    uterotonic: { name: string } | null;
    labourOnsetAt: Date | null;
    fullDilatationAt: Date | null;
    birthAt: Date;
    placentaDeliveredAt: Date | null;
    postpartumMonitoringEndedAt: Date | null;
    mode: DeliveryRecordView['mode'];
    episiotomy: boolean;
    perinealTearGrade: DeliveryRecordView['perinealTearGrade'];
    uterotonicMedicationId: string | null;
    uterotonicGivenAt: Date | null;
    bloodLossMl: number | null;
    placentaComplete: boolean | null;
    referredOut: boolean;
    referralReason: string | null;
    notes: string | null;
    newbornCareRecords: Parameters<DeliveryRecordService['toNewbornView']>[0][];
  }): DeliveryRecordView {
    return {
      id: delivery.id,
      pregnancyEpisodeId: delivery.pregnancyEpisodeId,
      admissionId: delivery.admissionId,
      attendantDoctorId: delivery.attendantDoctorId,
      attendantName: delivery.attendantDoctor.fullName,
      labourOnsetAt: this.toIsoOrNull(delivery.labourOnsetAt),
      fullDilatationAt: this.toIsoOrNull(delivery.fullDilatationAt),
      birthAt: delivery.birthAt.toISOString(),
      placentaDeliveredAt: this.toIsoOrNull(delivery.placentaDeliveredAt),
      postpartumMonitoringEndedAt: this.toIsoOrNull(delivery.postpartumMonitoringEndedAt),
      mode: delivery.mode,
      episiotomy: delivery.episiotomy,
      perinealTearGrade: delivery.perinealTearGrade,
      uterotonicMedicationId: delivery.uterotonicMedicationId,
      uterotonicName: delivery.uterotonic?.name ?? null,
      uterotonicGivenAt: this.toIsoOrNull(delivery.uterotonicGivenAt),
      bloodLossMl: delivery.bloodLossMl,
      placentaComplete: delivery.placentaComplete,
      referredOut: delivery.referredOut,
      referralReason: delivery.referralReason,
      notes: delivery.notes,
      newborns: delivery.newbornCareRecords.map((baby) => this.toNewbornView(baby)),
    };
  }

  private toNewbornView(newborn: {
    id: string;
    outcome: NewbornCareView['outcome'];
    stillbirthOrder: number | null;
    newbornPatientId: string | null;
    newbornPatient: { fullName: string; birthOrder: number | null } | null;
    sex: NewbornCareView['sex'];
    birthWeightGrams: number | null;
    lengthCm: unknown;
    headCircumferenceCm: unknown;
    apgar1Min: number | null;
    apgar5Min: number | null;
    imdStartedAt: Date | null;
    imdDurationMinutes: number | null;
    cordCareAt: Date | null;
    vitaminK1GivenAt: Date | null;
    eyeProphylaxisGivenAt: Date | null;
    hb0ImmunizationId: string | null;
    examinedAt: Date | null;
    identityTagAt: Date | null;
  }): NewbornCareView {
    return {
      id: newborn.id,
      outcome: newborn.outcome,
      // One position, read from wherever it lives: the patient record for a
      // live baby (P24-T10), this row for a stillbirth.
      birthOrder: newborn.newbornPatient?.birthOrder ?? newborn.stillbirthOrder,
      newbornPatientId: newborn.newbornPatientId,
      newbornName: newborn.newbornPatient?.fullName ?? null,
      sex: newborn.sex,
      birthWeightGrams: newborn.birthWeightGrams,
      lengthCm: this.toNumberOrNull(newborn.lengthCm),
      headCircumferenceCm: this.toNumberOrNull(newborn.headCircumferenceCm),
      apgar1Min: newborn.apgar1Min,
      apgar5Min: newborn.apgar5Min,
      imdStartedAt: this.toIsoOrNull(newborn.imdStartedAt),
      imdDurationMinutes: newborn.imdDurationMinutes,
      cordCareAt: this.toIsoOrNull(newborn.cordCareAt),
      vitaminK1GivenAt: this.toIsoOrNull(newborn.vitaminK1GivenAt),
      eyeProphylaxisGivenAt: this.toIsoOrNull(newborn.eyeProphylaxisGivenAt),
      hb0ImmunizationId: newborn.hb0ImmunizationId,
      examinedAt: this.toIsoOrNull(newborn.examinedAt),
      identityTagAt: this.toIsoOrNull(newborn.identityTagAt),
    };
  }

  /** An ISO instant from the wire becomes the `Date` the column stores. */
  private toInstantOrNull(value: string | null | undefined): Date | null {
    return value === null || value === undefined ? null : new Date(value);
  }

  private toIsoOrNull(value: Date | null): string | null {
    return value === null ? null : value.toISOString();
  }

  private toNumberOrNull(value: unknown): number | null {
    return value === null || value === undefined ? null : Number(value);
  }
}
