import { Injectable } from '@nestjs/common';

import {
  AntreanCancelRequest,
  AntreanRemainingRequest,
  AntreanRemainingResponse,
  AntreanStatusRequest,
  AntreanStatusResponse,
  AntreanTakeRequest,
  AntreanTakeResponse,
  AppointmentListItem,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AppointmentManagementService } from '../../appointment-management/service/appointment-management.service';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { BpjsAntreanServiceError } from '../bpjs-antrean-service.error';
import { buildAntreanBookingCode } from './build-antrean-booking-code';
import { estimateAntreanServiceTime } from './estimate-antrean-service-time';
import { BpjsAntreanInboundConfig } from '../../../common/bpjs-antrean/bpjs-antrean-inbound.config';
import {
  BpjsAntreanScheduleResolver,
  ResolvedAntreanSchedule,
} from './bpjs-antrean-schedule-resolver.service';

const NOT_FOUND_META_CODE = 404;
const CONFLICT_META_CODE = 400;
const NO_QUEUE_CALLED = '-';
const CANCELLABLE_STATUSES = ['SCHEDULED', 'CONFIRMED'] as const;

/**
 * The four queue-facing inbound services: *status antrean*, *ambil antrean*,
 * *sisa antrean*, *batal antrean* (P14-T04).
 *
 * Everything here goes through domain **services** — never a repository. That
 * is §4.2's rule, and on this path it is also what keeps the invariants on one
 * code path: session capacity, the booking cutoff, the "one open booking per
 * patient per session" rule, and the queue-position allocation are enforced by
 * the same `AppointmentManagementService` a front-desk booking goes through.
 * A Mobile JKN member gets no shortcuts the counter does not have.
 *
 * One honest gap runs through the whole file. §3.5: **HMS records no "patient
 * called" event** — a registration goes `PENDING → CHECKED_IN → COMPLETED`,
 * and the doctor's act of calling the next patient is not captured anywhere.
 * So `antreanpanggil` is derived from the furthest-progressed booking rather
 * than observed, and says so wherever it is built. If the spike's answer to Q1
 * is that FKTP does use the FKRTL task-ID vocabulary, that event has to be
 * added to the registration lifecycle as its own task; it is not something to
 * approximate more cleverly here.
 */
@Injectable()
export class BpjsAntreanQueueService {
  constructor(
    private readonly scheduleResolver: BpjsAntreanScheduleResolver,
    private readonly appointmentService: AppointmentManagementService,
    private readonly patientService: PatientManagementService,
    private readonly inboundConfig: BpjsAntreanInboundConfig,
  ) {}

  async getStatus(
    request: AntreanStatusRequest,
    actor: CurrentUser,
  ): Promise<AntreanStatusResponse> {
    const schedule = await this.scheduleResolver.resolve(request, actor);
    const queue = await this.readSessionQueue(schedule, actor);
    return {
      namapoli: schedule.poliName,
      namadokter: schedule.doctorName,
      totalantrean: schedule.session.bookedCount,
      sisaantrean: this.countWaiting(queue),
      antreanpanggil: this.resolveCalledNumber(queue),
      keterangan: this.describeBookingAvailability(schedule),
    };
  }

  async takeQueueNumber(
    request: AntreanTakeRequest,
    actor: CurrentUser,
  ): Promise<AntreanTakeResponse> {
    const schedule = await this.scheduleResolver.resolve(request, actor);
    const patient = await this.requireRegisteredMember(request, actor);
    const bookingCode = buildAntreanBookingCode({
      poliCode: request.kodepoli,
      examinationDate: request.tanggalperiksa,
    });
    const booking = await this.appointmentService.bookSessionForBpjsAntrean(
      {
        patientId: patient.id,
        doctorId: schedule.doctorId,
        scheduleId: schedule.session.scheduleId,
        sessionDate: request.tanggalperiksa,
        bpjsBookingCode: bookingCode,
        reason: request.keterangan,
      },
      actor,
    );
    return {
      nomorantrean: this.formatQueueNumber(request.kodepoli, booking.queueNumber),
      angkaantrean: booking.queueNumber,
      kodebooking: bookingCode,
      norm: patient.mrn,
      namapoli: schedule.poliName,
      namadokter: schedule.doctorName,
      estimasidilayani: estimateAntreanServiceTime({
        sessionStart: new Date(booking.appointment.scheduledAt),
        queuePosition: booking.queueNumber,
        averageServiceMinutes: this.inboundConfig.averageServiceMinutes,
      }),
      sisakuotajkn: this.resolveRemainingQuota(schedule, 1),
      kuotajkn: schedule.session.maxPatients,
      keterangan: 'Peserta harap datang 30 menit sebelum jam praktik',
    };
  }

  async getRemaining(
    request: AntreanRemainingRequest,
    actor: CurrentUser,
  ): Promise<AntreanRemainingResponse> {
    const appointment = await this.requireBooking(request.kodebooking, actor);
    const queue = await this.appointmentService.getSessionQueue(
      this.requireSessionId(appointment),
      actor,
    );
    const position = appointment.queueNumber ?? 0;
    const ahead = queue.queue.filter(
      (entry) => (entry.queueNumber ?? 0) < position && entry.status !== 'CANCELLED',
    ).length;
    return {
      nomorantrean: this.formatQueueNumber('', position),
      namapoli: appointment.doctor.specialty,
      namadokter: appointment.doctor.fullName,
      sisaantrean: ahead,
      antreanpanggil: this.resolveCalledNumber(queue.queue),
      waktutunggu: ahead * this.inboundConfig.averageServiceMinutes,
      keterangan: 'Estimasi waktu tunggu dihitung dari rata-rata layanan poli',
    };
  }

  async cancel(request: AntreanCancelRequest, actor: CurrentUser): Promise<string> {
    const appointment = await this.requireBooking(request.kodebooking, actor);
    const isCancellable = CANCELLABLE_STATUSES.some(
      (status) => status === appointment.status,
    );
    if (!isCancellable) {
      throw new BpjsAntreanServiceError(
        CONFLICT_META_CODE,
        `Antrean dengan status ${appointment.status} tidak dapat dibatalkan`,
      );
    }
    await this.appointmentService.cancelAppointment(
      appointment.id,
      { reason: request.keterangan },
      actor,
    );
    return appointment.id;
  }

  /**
   * `ambil antrean` never creates a patient. BPJS calls *pasien baru* first
   * for a member with no record here, and conflating the two would mean a
   * malformed booking silently minting a patient row — the most expensive
   * thing this surface can do, triggered by the cheapest mistake.
   */
  private async requireRegisteredMember(
    request: AntreanTakeRequest,
    actor: CurrentUser,
  ): Promise<{ id: string; mrn: string }> {
    const byCard = await this.findMember({ bpjsNumber: request.nomorkartu }, actor);
    if (byCard !== null) {
      return byCard;
    }
    const byNik = await this.findMember({ nik: request.nik }, actor);
    if (byNik !== null) {
      return byNik;
    }
    throw new BpjsAntreanServiceError(
      NOT_FOUND_META_CODE,
      'Peserta belum terdaftar di fasilitas ini; daftarkan melalui layanan pasien baru',
    );
  }

  private async findMember(
    filter: { nik?: string; bpjsNumber?: string },
    actor: CurrentUser,
  ): Promise<{ id: string; mrn: string } | null> {
    const result = await this.patientService.listPatients(
      { page: 1, limit: 1, ...filter },
      actor,
    );
    const [match] = result.items;
    if (match === undefined) {
      return null;
    }
    const detail = await this.patientService.getPatientById(match.id, actor);
    return { id: detail.id, mrn: detail.mrn };
  }

  private async requireBooking(
    bookingCode: string,
    actor: CurrentUser,
  ): Promise<AppointmentListItem> {
    try {
      return await this.appointmentService.getAppointmentByBpjsBookingCode(bookingCode, actor);
    } catch {
      throw new BpjsAntreanServiceError(
        NOT_FOUND_META_CODE,
        `Kode booking ${bookingCode} tidak ditemukan`,
      );
    }
  }

  private requireSessionId(appointment: AppointmentListItem): string {
    const sessionId = appointment.sessionId;
    if (sessionId === undefined || sessionId === null) {
      throw new BpjsAntreanServiceError(
        CONFLICT_META_CODE,
        'Antrean tidak terhubung ke sesi praktik',
      );
    }
    return sessionId;
  }

  private async readSessionQueue(
    schedule: ResolvedAntreanSchedule,
    actor: CurrentUser,
  ): Promise<Array<{ queueNumber: number | null; status: string }>> {
    if (schedule.session.id === null) {
      // A schedule window nobody has booked yet has no materialised session
      // row. That is a legitimate empty queue, not an error: the first
      // `ambil antrean` creates the session.
      return [];
    }
    const queue = await this.appointmentService.getSessionQueue(schedule.session.id, actor);
    return queue.queue;
  }

  private countWaiting(queue: Array<{ status: string }>): number {
    return queue.filter((entry) => entry.status === 'SCHEDULED' || entry.status === 'CONFIRMED')
      .length;
  }

  /**
   * The best approximation HMS can make of "which number is being served".
   * §3.5: there is no called event, so this reports the highest number that
   * has *finished* — which lags the real call by one patient. Stated here
   * rather than hidden, because it is what BPJS's dashboard will show.
   */
  private resolveCalledNumber(queue: Array<{ queueNumber: number | null; status: string }>): string {
    const served = queue
      .filter((entry) => entry.status === 'COMPLETED')
      .map((entry) => entry.queueNumber ?? 0);
    if (served.length === 0) {
      return NO_QUEUE_CALLED;
    }
    return this.formatQueueNumber('', Math.max(...served));
  }

  private describeBookingAvailability(schedule: ResolvedAntreanSchedule): string {
    if (schedule.session.status !== 'OPEN') {
      return 'Pendaftaran ditutup';
    }
    const remaining = this.resolveRemainingQuota(schedule, 0);
    if (remaining !== null && remaining <= 0) {
      return 'Kuota penuh';
    }
    return 'Pendaftaran dibuka';
  }

  private resolveRemainingQuota(
    schedule: ResolvedAntreanSchedule,
    alreadyConsumed: number,
  ): number | null {
    if (schedule.session.remaining === null) {
      return null;
    }
    return Math.max(0, schedule.session.remaining - alreadyConsumed);
  }

  /**
   * BPJS renders `nomorantrean` as a display string (`A-12`) alongside the
   * bare `angkaantrean`. HMS has no letter series per poli, so the poli code
   * stands in where one is available and the number alone is used where it is
   * not — a made-up letter would look like a series the clinic does not run.
   */
  private formatQueueNumber(poliCode: string, queueNumber: number): string {
    return poliCode === '' ? `${queueNumber}` : `${poliCode}-${queueNumber}`;
  }
}
