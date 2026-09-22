import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { BpjsNonCapitationRecapRepository } from '../repository/bpjs-non-capitation-recap.repository';
import { BpjsNonCapitationRecapService } from './bpjs-non-capitation-recap.service';
import { BpjsNonCapitationSettingsService } from './bpjs-non-capitation-settings.service';

const MONTH = '2026-10';
const ACTOR = { sub: 'admin-user', email: 'admin@example.test' } as CurrentUser;
const BPJS_PATIENT = { id: 'mother-1', fullName: 'Siti Aminah', bpjsNumberLast4: '4821' };

describe('BpjsNonCapitationRecapService (P25-T16)', () => {
  const repositoryMock = {
    listAntenatalVisits: jest.fn(),
    listPostnatalVisits: jest.fn(),
    listDeliveries: jest.fn(),
    listFamilyPlanningActs: jest.fn(),
    listDocuments: jest.fn(),
    listMarks: jest.fn(),
    createMarks: jest.fn(),
  };
  const settingsServiceMock = {
    getSettings: jest.fn(),
    listTariffSources: jest.fn(),
  };
  const clinicProfileServiceMock = { getReportingIdentity: jest.fn() };
  const auditServiceMock = { record: jest.fn() };
  let service: BpjsNonCapitationRecapService;

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.listAntenatalVisits.mockResolvedValue([
      {
        antenatalVisitId: 'anc-1',
        encounterId: 'encounter-1',
        startedAt: new Date('2026-10-14T09:00:00+07:00'),
        visitCode: 'K2',
        examinerProfession: 'MIDWIFE',
        hasUltrasound: false,
        hasReferral: false,
        patient: BPJS_PATIENT,
      },
    ]);
    repositoryMock.listPostnatalVisits.mockResolvedValue([]);
    repositoryMock.listDeliveries.mockResolvedValue([]);
    repositoryMock.listFamilyPlanningActs.mockResolvedValue([]);
    repositoryMock.listDocuments.mockResolvedValue([]);
    repositoryMock.listMarks.mockResolvedValue([]);
    settingsServiceMock.getSettings.mockResolvedValue({
      networkParentProviderCode: null,
      networkParentProviderName: null,
      isNetworkParentGovernmentOwned: null,
      hasOwnEclaimLogin: null,
      filingDayOfMonth: 10,
      isConfigured: false,
      updatedAt: null,
    });
    settingsServiceMock.listTariffSources.mockResolvedValue([]);
    clinicProfileServiceMock.getReportingIdentity.mockResolvedValue({
      clinicName: 'Klinik Bidan Sehati',
      puskesmasName: null,
      puskesmasCode: null,
      address: null,
      phoneNumber: null,
    });
    service = new BpjsNonCapitationRecapService(
      repositoryMock as unknown as BpjsNonCapitationRecapRepository,
      settingsServiceMock as unknown as BpjsNonCapitationSettingsService,
      clinicProfileServiceMock as unknown as ClinicProfileService,
      auditServiceMock as unknown as AuditService,
      { get: jest.fn(() => 'Asia/Jakarta') } as unknown as ConfigService,
    );
  });

  it('answers each item and audits only the line it newly marked', async () => {
    repositoryMock.createMarks.mockResolvedValue([
      { serviceType: 'ANTENATAL_MIDWIFE', sourceId: 'anc-1' },
    ]);

    const actualResponse = await service.markLines(
      {
        month: MONTH,
        items: [
          { serviceType: 'ANTENATAL_MIDWIFE', sourceId: 'anc-1' },
          { serviceType: 'ANTENATAL_MIDWIFE', sourceId: 'anc-1' },
          { serviceType: 'PRE_REFERRAL', sourceId: 'encounter-1' },
        ],
      },
      ACTOR,
    );

    expect(repositoryMock.createMarks).toHaveBeenCalledWith({
      items: [{ serviceType: 'ANTENATAL_MIDWIFE', sourceId: 'anc-1' }],
      claimMonth: '2026-10-01',
      markedById: 'admin-user',
    });
    expect(actualResponse.results.map((result) => result.outcome)).toEqual([
      'MARKED',
      'NOT_IN_RECAP',
    ]);
    expect(auditServiceMock.record).toHaveBeenCalledTimes(1);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NON_CAPITATION_CLAIM_MARKED',
        patientId: 'mother-1',
        metadata: { month: MONTH, serviceType: 'ANTENATAL_MIDWIFE', sourceId: 'anc-1' },
      }),
    );
  });

  it('answers ALREADY_MARKED and audits nothing when the mark already exists', async () => {
    repositoryMock.createMarks.mockResolvedValue([]);

    const actualResponse = await service.markLines(
      { month: MONTH, items: [{ serviceType: 'ANTENATAL_MIDWIFE', sourceId: 'anc-1' }] },
      ACTOR,
    );

    expect(actualResponse.markedCount).toBe(0);
    expect(actualResponse.results[0]?.outcome).toBe('ALREADY_MARKED');
    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });

  it('builds the recap against the default filing day when no induk is configured', async () => {
    const actualRecap = await service.getRecap(MONTH, new Date('2026-11-06T02:00:00.000Z'));

    expect(actualRecap.filingDeadline).toBe('2026-11-10');
    expect(actualRecap.daysUntilFilingDeadline).toBe(4);
    expect(actualRecap.lines).toHaveLength(1);
    expect(actualRecap.lines[0]?.status).toBe('DUE_SOON');
    expect(actualRecap.settings.isConfigured).toBe(false);
  });
});
