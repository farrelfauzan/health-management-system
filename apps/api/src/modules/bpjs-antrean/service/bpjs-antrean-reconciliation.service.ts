import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  BpjsAntreanDriftFinding,
  BpjsAntreanReconciliationReport,
  getCalendarDateInTimeZone,
} from '@hms/shared-types';

import { BpjsAntreanHttpClient } from '../../../common/bpjs-antrean/bpjs-antrean-http.client';
import { BpjsAntreanConnection } from '../../../common/bpjs-antrean/bpjs-antrean.types';
import {
  BpjsAntreanReferenceEntry,
  parseBpjsAntreanReferenceList,
} from '../../../common/bpjs-antrean/parse-bpjs-antrean-reference-list';
import { BpjsAntreanConfigRepository } from '../repository/bpjs-antrean-config.repository';
import {
  BpjsAntreanReconciliationRepository,
  MappedDoctorRow,
  MappedSpecialtyRow,
} from '../repository/bpjs-antrean-reconciliation.repository';

const POLI_REFERENCE_PATH = 'ref/poli';
const DOCTOR_REFERENCE_PATH = 'ref/dokter';
const POLI_CODE_FIELD = 'kodepoli';
const POLI_DISPLAY_FIELD = 'namapoli';
const DOCTOR_CODE_FIELD = 'kodedokter';
const DOCTOR_DISPLAY_FIELD = 'namadokter';
const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const DEFAULT_WINDOW_DAYS = 7;
const DAY_IN_MS = 86_400_000;

/**
 * Compares HFIS against HMS and reports the disagreements (P14-T05, §4.3).
 *
 * **Reconciliation, not sync — and the distinction is the design.** HFIS is
 * what Mobile JKN renders: poli, doctors, shifts, quota. HMS cannot write it,
 * and it should not silently rewrite its own side to match either, because
 * either system can be the wrong one. A doctor missing from HFIS might be a
 * portal that was never updated; the same doctor missing from HMS might be a
 * mapping typo. Only the clinic knows which, so this produces a list and
 * stops.
 *
 * The finding that actually costs someone something is `NO_OPEN_SESSION`:
 * Mobile JKN will happily let a member book a shift HFIS advertises, and the
 * `ambil antrean` call then fails on a member already holding a screenshot of
 * their queue number. Surfacing it days ahead is the whole point of the
 * window.
 */
@Injectable()
export class BpjsAntreanReconciliationService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly configRepository: BpjsAntreanConfigRepository,
    private readonly reconciliationRepository: BpjsAntreanReconciliationRepository,
    private readonly httpClient: BpjsAntreanHttpClient,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async buildReport(): Promise<BpjsAntreanReconciliationReport> {
    const connection = await this.configRepository.getConnection();
    if (connection === null) {
      throw new NotFoundException('BPJS Antrean is not configured');
    }
    const windowFrom = this.resolveClinicToday();
    const windowTo = new Date(windowFrom.getTime() + DEFAULT_WINDOW_DAYS * DAY_IN_MS);
    const [hfisPoli, hfisDoctors, specialties, doctors] = await Promise.all([
      this.readReference(connection, POLI_REFERENCE_PATH, POLI_CODE_FIELD, POLI_DISPLAY_FIELD),
      this.readReference(
        connection,
        DOCTOR_REFERENCE_PATH,
        DOCTOR_CODE_FIELD,
        DOCTOR_DISPLAY_FIELD,
      ),
      this.reconciliationRepository.listSpecialties(),
      this.reconciliationRepository.listDoctorsWithOpenSessions({
        fromDate: windowFrom,
        toDate: windowTo,
      }),
    ]);
    return {
      checkedAt: new Date().toISOString(),
      windowFrom: this.toCalendarDate(windowFrom),
      windowTo: this.toCalendarDate(windowTo),
      hfisPoliCount: hfisPoli.length,
      hfisDoctorCount: hfisDoctors.length,
      findings: [
        ...this.comparePoli(hfisPoli, specialties),
        ...this.compareDoctors(hfisDoctors, doctors),
      ],
    };
  }

  private comparePoli(
    hfisPoli: BpjsAntreanReferenceEntry[],
    specialties: MappedSpecialtyRow[],
  ): BpjsAntreanDriftFinding[] {
    const hfisCodes = new Set(hfisPoli.map((entry) => entry.code));
    const mappedCodes = new Set(
      specialties.flatMap((specialty) =>
        specialty.bpjsPoliCode === null ? [] : [specialty.bpjsPoliCode],
      ),
    );
    return [
      ...specialties
        .filter((specialty) => specialty.bpjsPoliCode === null)
        .map((specialty) => ({
          kind: 'SPECIALTY_UNMAPPED' as const,
          code: null,
          subject: specialty.name,
          detail:
            'This poli has no BPJS code, so nothing it schedules can be published to Antrean Online',
        })),
      ...specialties
        .filter(
          (specialty) =>
            specialty.bpjsPoliCode !== null && !hfisCodes.has(specialty.bpjsPoliCode),
        )
        .map((specialty) => ({
          kind: 'POLI_ONLY_IN_HMS' as const,
          code: specialty.bpjsPoliCode,
          subject: specialty.name,
          detail:
            'HMS maps this poli to a code HFIS does not list — either the mapping is wrong or the poli is missing from the Antrean Faskes portal',
        })),
      ...hfisPoli
        .filter((entry) => !mappedCodes.has(entry.code))
        .map((entry) => ({
          kind: 'POLI_ONLY_IN_HFIS' as const,
          code: entry.code,
          subject: entry.display,
          detail:
            'Mobile JKN offers this poli but no HMS specialty is mapped to it — bookings for it cannot be honoured',
        })),
    ];
  }

  private compareDoctors(
    hfisDoctors: BpjsAntreanReferenceEntry[],
    doctors: MappedDoctorRow[],
  ): BpjsAntreanDriftFinding[] {
    const hfisCodes = new Set(hfisDoctors.map((entry) => entry.code));
    const mappedCodes = new Set(
      doctors.flatMap((doctor) => (doctor.bpjsDoctorCode === null ? [] : [doctor.bpjsDoctorCode])),
    );
    return [
      ...doctors
        .filter((doctor) => doctor.bpjsDoctorCode === null)
        .map((doctor) => ({
          kind: 'DOCTOR_UNMAPPED' as const,
          code: null,
          subject: doctor.fullName,
          detail:
            'This practitioner has no BPJS kdDokter, so their sessions cannot be published to Antrean Online',
        })),
      ...doctors
        .filter(
          (doctor) => doctor.bpjsDoctorCode !== null && !hfisCodes.has(doctor.bpjsDoctorCode),
        )
        .map((doctor) => ({
          kind: 'DOCTOR_ONLY_IN_HMS' as const,
          code: doctor.bpjsDoctorCode,
          subject: doctor.fullName,
          detail:
            'HMS maps this practitioner to a code HFIS does not list — check the mapping against the Antrean Faskes portal',
        })),
      ...doctors
        .filter(
          (doctor) =>
            doctor.bpjsDoctorCode !== null &&
            hfisCodes.has(doctor.bpjsDoctorCode) &&
            doctor.openSessionCount === 0,
        )
        .map((doctor) => ({
          kind: 'NO_OPEN_SESSION' as const,
          code: doctor.bpjsDoctorCode,
          subject: doctor.fullName,
          detail:
            'HFIS advertises this practitioner but HMS has no open session for them in the window — a member who books will be refused',
        })),
      ...hfisDoctors
        .filter((entry) => !mappedCodes.has(entry.code))
        .map((entry) => ({
          kind: 'DOCTOR_ONLY_IN_HFIS' as const,
          code: entry.code,
          subject: entry.display,
          detail:
            'Mobile JKN offers this practitioner but no HMS doctor is mapped to them — bookings for them cannot be honoured',
        })),
    ];
  }

  private async readReference(
    connection: BpjsAntreanConnection,
    path: string,
    codeField: string,
    displayField: string,
  ): Promise<BpjsAntreanReferenceEntry[]> {
    const envelope = await this.httpClient.sendRequest(connection, { method: 'GET', path });
    return parseBpjsAntreanReferenceList({
      response: envelope.response,
      codeField,
      displayField,
    });
  }

  private resolveClinicToday(): Date {
    const [year = '', month = '', day = ''] = getCalendarDateInTimeZone(
      new Date(),
      this.clinicTimeZone,
    ).split('-');
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  private toCalendarDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
