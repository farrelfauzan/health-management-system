import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';

import { BpjsAntreanDriftKind } from '@hms/shared-types';

import { BpjsAntreanHttpClient } from '../../../common/bpjs-antrean/bpjs-antrean-http.client';
import { BpjsAntreanConfigRepository } from '../repository/bpjs-antrean-config.repository';
import { BpjsAntreanReconciliationRepository } from '../repository/bpjs-antrean-reconciliation.repository';
import { BpjsAntreanReconciliationService } from './bpjs-antrean-reconciliation.service';

const CONNECTION = {
  environment: 'DEVELOPMENT' as const,
  credentials: { consId: '20250042', secretKey: 'secret', userKey: 'user' },
};

function buildService(params: {
  hfisPoli?: Array<{ kodepoli: string; namapoli: string }>;
  hfisDoctors?: Array<{ kodedokter: string; namadokter: string }>;
  specialties?: Array<{ id: string; name: string; bpjsPoliCode: string | null }>;
  doctors?: Array<{
    id: string;
    fullName: string;
    bpjsDoctorCode: string | null;
    openSessionCount: number;
  }>;
  connection?: unknown;
}) {
  const httpClientMock = {
    sendRequest: jest.fn((_connection: unknown, request: { path: string }) =>
      Promise.resolve({
        metaData: { code: 200, message: 'Ok' },
        response: request.path === 'ref/poli' ? (params.hfisPoli ?? []) : (params.hfisDoctors ?? []),
      }),
    ),
  };
  const configRepositoryMock = {
    getConnection: jest
      .fn()
      .mockResolvedValue(params.connection === undefined ? CONNECTION : params.connection),
  };
  const reconciliationRepositoryMock = {
    listSpecialties: jest.fn().mockResolvedValue(params.specialties ?? []),
    listDoctorsWithOpenSessions: jest.fn().mockResolvedValue(params.doctors ?? []),
  };
  return {
    service: new BpjsAntreanReconciliationService(
      configRepositoryMock as unknown as BpjsAntreanConfigRepository,
      reconciliationRepositoryMock as unknown as BpjsAntreanReconciliationRepository,
      httpClientMock as unknown as BpjsAntreanHttpClient,
      { get: () => 'Asia/Jakarta' } as unknown as ConfigService,
    ),
    httpClientMock,
    reconciliationRepositoryMock,
  };
}

function kindsOf(findings: Array<{ kind: BpjsAntreanDriftKind }>): BpjsAntreanDriftKind[] {
  return findings.map((finding) => finding.kind).sort();
}

describe('BpjsAntreanReconciliationService', () => {
  it('reports nothing when HFIS and HMS agree', async () => {
    const { service } = buildService({
      hfisPoli: [{ kodepoli: '001', namapoli: 'Umum' }],
      hfisDoctors: [{ kodedokter: 'D01', namadokter: 'dr. Andi' }],
      specialties: [{ id: 'specialty-1', name: 'Umum', bpjsPoliCode: '001' }],
      doctors: [
        { id: 'doctor-1', fullName: 'dr. Andi', bpjsDoctorCode: 'D01', openSessionCount: 3 },
      ],
    });

    const actual = await service.buildReport();

    expect(actual.findings).toEqual([]);
    expect(actual.hfisPoliCount).toBe(1);
    expect(actual.hfisDoctorCount).toBe(1);
  });

  it('names a poli HFIS offers that HMS cannot honour', async () => {
    const { service } = buildService({
      hfisPoli: [{ kodepoli: '002', namapoli: 'Gigi' }],
      specialties: [{ id: 'specialty-1', name: 'Umum', bpjsPoliCode: '001' }],
    });

    const actual = await service.buildReport();

    expect(kindsOf(actual.findings)).toEqual(['POLI_ONLY_IN_HFIS', 'POLI_ONLY_IN_HMS']);
  });

  it('flags a specialty with no BPJS code at all', async () => {
    const { service } = buildService({
      specialties: [{ id: 'specialty-1', name: 'Umum', bpjsPoliCode: null }],
    });

    const actual = await service.buildReport();

    expect(kindsOf(actual.findings)).toEqual(['SPECIALTY_UNMAPPED']);
  });

  it('flags a doctor HFIS advertises with no open session in the window', async () => {
    // The finding that costs a patient something: Mobile JKN lets the member
    // book, and ambil antrean then refuses someone already holding a queue
    // number on their phone.
    const { service } = buildService({
      hfisDoctors: [{ kodedokter: 'D01', namadokter: 'dr. Andi' }],
      doctors: [
        { id: 'doctor-1', fullName: 'dr. Andi', bpjsDoctorCode: 'D01', openSessionCount: 0 },
      ],
    });

    const actual = await service.buildReport();

    expect(kindsOf(actual.findings)).toEqual(['NO_OPEN_SESSION']);
    expect(actual.findings[0]?.subject).toBe('dr. Andi');
  });

  it('does not report a missing session for a doctor HFIS does not advertise', async () => {
    // Nobody can book them through Mobile JKN, so an empty schedule is not
    // drift — it is just a doctor who is not on the antrean roster.
    const { service } = buildService({
      hfisDoctors: [],
      doctors: [
        { id: 'doctor-1', fullName: 'dr. Andi', bpjsDoctorCode: 'D01', openSessionCount: 0 },
      ],
    });

    const actual = await service.buildReport();

    expect(kindsOf(actual.findings)).toEqual(['DOCTOR_ONLY_IN_HMS']);
  });

  it('reads both reference endpoints and writes nothing', async () => {
    // §4.3: HMS cannot write HFIS and does not silently rewrite its own side
    // either — either system can be the wrong one.
    const { service, httpClientMock, reconciliationRepositoryMock } = buildService({});

    await service.buildReport();

    expect(httpClientMock.sendRequest).toHaveBeenCalledWith(
      CONNECTION,
      expect.objectContaining({ method: 'GET', path: 'ref/poli' }),
    );
    expect(httpClientMock.sendRequest).toHaveBeenCalledWith(
      CONNECTION,
      expect.objectContaining({ method: 'GET', path: 'ref/dokter' }),
    );
    expect(Object.keys(reconciliationRepositoryMock)).toEqual([
      'listSpecialties',
      'listDoctorsWithOpenSessions',
    ]);
  });

  it('reports the window it compared', async () => {
    const { service } = buildService({});

    const actual = await service.buildReport();

    expect(actual.windowFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(actual.windowTo > actual.windowFrom).toBe(true);
    expect(actual.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('refuses when antrean is not configured', async () => {
    const { service } = buildService({ connection: null });

    await expect(service.buildReport()).rejects.toBeInstanceOf(NotFoundException);
  });
});
