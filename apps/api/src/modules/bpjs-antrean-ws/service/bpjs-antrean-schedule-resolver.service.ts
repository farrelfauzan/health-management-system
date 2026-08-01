import { Injectable } from '@nestjs/common';

import { DoctorSessionListItem } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AppointmentManagementService } from '../../appointment-management/service/appointment-management.service';
import { BpjsMappingService } from '../../bpjs-pcare/service/bpjs-mapping.service';
import { BpjsAntreanServiceError } from '../bpjs-antrean-service.error';

const NOT_FOUND_META_CODE = 404;
const CONFLICT_META_CODE = 400;

export type ResolvedAntreanSchedule = {
  readonly specialtyId: string;
  readonly poliName: string;
  readonly doctorId: string;
  readonly doctorName: string;
  readonly session: DoctorSessionListItem;
};

/**
 * Translates BPJS's schedule vocabulary (`kodepoli`, `kodedokter`,
 * `jampraktek`, `tanggalperiksa`) into the HMS entities a booking is made
 * against.
 *
 * This is where §4.3's "reconciliation, not sync" is felt at runtime. HFIS is
 * the source of truth for what Mobile JKN renders, and HMS cannot write it —
 * so drift arrives here, as a member holding a screenshot of a shift HMS has
 * no session for. Every refusal below is therefore written to be *readable on
 * a phone*: "refusing legibly is better than accepting a booking the clinic
 * cannot honour."
 *
 * The poli/doctor codes are read through `BpjsMappingService`, which is the
 * PCare mapping. Whether HFIS uses the same codes is spike question Q3, and
 * the evaluation is explicit that they may not — if they diverge, this
 * resolver reads an HFIS-scoped sibling column instead, and nothing else in
 * the module changes.
 */
@Injectable()
export class BpjsAntreanScheduleResolver {
  constructor(
    private readonly mappingService: BpjsMappingService,
    private readonly appointmentService: AppointmentManagementService,
  ) {}

  async resolve(
    params: {
      kodepoli: string;
      kodedokter: string;
      tanggalperiksa: string;
      jampraktek: string;
    },
    actor: CurrentUser,
  ): Promise<ResolvedAntreanSchedule> {
    const overview = await this.mappingService.getOverview();
    const specialty = overview.specialties.find(
      (candidate) => candidate.bpjsPoliCode === params.kodepoli,
    );
    if (specialty === undefined) {
      throw new BpjsAntreanServiceError(
        NOT_FOUND_META_CODE,
        `Poli ${params.kodepoli} tidak terdaftar di fasilitas ini`,
      );
    }
    const doctor = overview.doctors.find(
      (candidate) => candidate.bpjsDoctorCode === params.kodedokter,
    );
    if (doctor === undefined) {
      throw new BpjsAntreanServiceError(
        NOT_FOUND_META_CODE,
        `Dokter ${params.kodedokter} tidak terdaftar di fasilitas ini`,
      );
    }
    if (doctor.specialtyName !== specialty.name) {
      throw new BpjsAntreanServiceError(
        CONFLICT_META_CODE,
        `Dokter ${doctor.fullName} tidak praktik di poli ${specialty.name}`,
      );
    }
    const session = await this.resolveSession({
      doctorId: doctor.doctorId,
      doctorName: doctor.fullName,
      tanggalperiksa: params.tanggalperiksa,
      jampraktek: params.jampraktek,
    }, actor);
    return {
      specialtyId: specialty.specialtyId,
      poliName: specialty.name,
      doctorId: doctor.doctorId,
      doctorName: doctor.fullName,
      session,
    };
  }

  private async resolveSession(
    params: {
      doctorId: string;
      doctorName: string;
      tanggalperiksa: string;
      jampraktek: string;
    },
    actor: CurrentUser,
  ): Promise<DoctorSessionListItem> {
    const [startTime] = params.jampraktek.split('-');
    const sessions = await this.appointmentService.listDoctorSessions(
      params.doctorId,
      { from: params.tanggalperiksa, to: params.tanggalperiksa },
      actor,
    );
    const session = sessions.find((candidate) => candidate.startTime === startTime);
    if (session === undefined) {
      throw new BpjsAntreanServiceError(
        NOT_FOUND_META_CODE,
        `Tidak ada jadwal praktik ${params.jampraktek} untuk ${params.doctorName} pada ${params.tanggalperiksa}`,
      );
    }
    return session;
  }
}
