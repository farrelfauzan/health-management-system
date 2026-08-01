import { Injectable } from '@nestjs/common';

import { AntreanNewPatientRequest, AntreanNewPatientResponse } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { PrivacyNoticeRepository } from '../../../common/privacy-notice/privacy-notice.repository';
import { BpjsAntreanServiceError } from '../bpjs-antrean-service.error';

const SERVICE_UNAVAILABLE_META_CODE = 503;

/**
 * *Pasien baru* — the second of the two inbound services that write clinical
 * master data from the public internet (P14-T04).
 *
 * §3.4 said the data side already fits: NIK and card number are sealed with a
 * unique blind index, the MRN comes from `MrnCounter`, and dedupe-before-create
 * is a blind-index lookup that already exists. All of that is reused verbatim
 * by calling `PatientManagementService` — this service adds no persistence of
 * its own and could not bypass those invariants if it wanted to.
 *
 * **Dedupe is not optional here.** BPJS calls this whenever *its* records say
 * the member has no MRN at this clinic, which is not the same question as
 * whether HMS has a record — a walk-in registered at the counter last year is
 * exactly that case. So an existing member is returned with their existing
 * MRN rather than rejected: a duplicate patient record is a split medical
 * history, and PMK 24/2022 retention makes it permanent.
 *
 * The privacy notice is the one place this service cannot simply reuse the
 * counter's behaviour. Nobody is present, so nothing can be acknowledged; the
 * record is written as `DEFERRED_REMOTE_REGISTRATION` with `BPJS_ANTREAN`
 * provenance, and the clinic owes this patient the notice at their first
 * visit. Recording it as acknowledged would have been one line shorter and
 * fabricated legal evidence.
 */
@Injectable()
export class BpjsAntreanNewPatientService {
  constructor(
    private readonly patientService: PatientManagementService,
    private readonly privacyNoticeRepository: PrivacyNoticeRepository,
  ) {}

  async registerMember(
    request: AntreanNewPatientRequest,
    actor: CurrentUser,
  ): Promise<AntreanNewPatientResponse> {
    const existing = await this.findExistingMember(request, actor);
    if (existing !== null) {
      return {
        norm: existing.mrn,
        nama: existing.fullName,
        keterangan: 'Peserta sudah terdaftar; nomor rekam medis yang sudah ada digunakan kembali',
      };
    }
    return this.createMember(request, actor);
  }

  private async createMember(
    request: AntreanNewPatientRequest,
    actor: CurrentUser,
  ): Promise<AntreanNewPatientResponse> {
    const created = await this.patientService.createPatient(
      {
        fullName: request.nama,
        dateOfBirth: request.tanggallahir,
        sex: request.jeniskelamin === 'L' ? 'MALE' : 'FEMALE',
        status: 'OUT_PATIENT',
        phoneNumber: request.nohp,
        address: request.alamat,
        nik: request.nik,
        bpjsNumber: request.nomorkartu,
        isActive: true,
        privacyNotice: await this.buildDeferredPrivacyNotice(),
      },
      actor,
    );
    return {
      norm: created.patient.mrn,
      nama: created.patient.fullName,
      keterangan: 'Peserta berhasil didaftarkan; pemberitahuan privasi diberikan saat kunjungan',
    };
  }

  private async findExistingMember(
    request: AntreanNewPatientRequest,
    actor: CurrentUser,
  ): Promise<{ mrn: string; fullName: string } | null> {
    const byCard = await this.findByIdentifier({ bpjsNumber: request.nomorkartu }, actor);
    if (byCard !== null) {
      return byCard;
    }
    return this.findByIdentifier({ nik: request.nik }, actor);
  }

  private async findByIdentifier(
    filter: { nik?: string; bpjsNumber?: string },
    actor: CurrentUser,
  ): Promise<{ mrn: string; fullName: string } | null> {
    const result = await this.patientService.listPatients(
      { page: 1, limit: 1, ...filter },
      actor,
    );
    const [match] = result.items;
    if (match === undefined) {
      return null;
    }
    const detail = await this.patientService.getPatientById(match.id, actor);
    return { mrn: detail.mrn, fullName: detail.fullName };
  }

  private async buildDeferredPrivacyNotice(): Promise<{
    privacyNoticeVersionId: string;
    locale: 'id';
    outcome: 'DEFERRED_REMOTE_REGISTRATION';
    subjectType: 'SELF';
    provenance: 'BPJS_ANTREAN';
  }> {
    const current = await this.privacyNoticeRepository.findCurrentVersion();
    if (current === null) {
      throw new BpjsAntreanServiceError(
        SERVICE_UNAVAILABLE_META_CODE,
        'Fasilitas belum siap menerima pendaftaran peserta baru',
      );
    }
    return {
      privacyNoticeVersionId: current.id,
      locale: 'id',
      outcome: 'DEFERRED_REMOTE_REGISTRATION',
      subjectType: 'SELF',
      provenance: 'BPJS_ANTREAN',
    };
  }
}
