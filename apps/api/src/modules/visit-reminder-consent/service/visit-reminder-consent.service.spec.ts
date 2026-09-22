import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { PrivacyNoticeRepository } from '../../../common/privacy-notice/privacy-notice.repository';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { PatientVisitReminderConsentRepository } from '../repository/patient-visit-reminder-consent.repository';
import { VisitReminderConsentService } from './visit-reminder-consent.service';

const PATIENT_ID = 'patient-rina';
const CURRENT_USER = { sub: 'user-clerk' } as CurrentUser;
const GRANTED_RECORD = {
  patientId: PATIENT_ID,
  isGranted: true,
  noticeVersion: { id: 'notice-1', version: '1.0' },
  grantedAt: new Date('2026-10-01T02:00:00.000Z'),
  grantedBy: { id: 'user-clerk', email: 'kasir@klinik.example', name: 'Kasir' },
  revokedAt: null,
  revokedReason: null,
};

describe('VisitReminderConsentService', () => {
  let mockRepository: jest.Mocked<
    Pick<PatientVisitReminderConsentRepository, 'findByPatient' | 'grant' | 'revoke'>
  >;
  let mockPrivacyNoticeRepository: jest.Mocked<Pick<PrivacyNoticeRepository, 'findCurrentVersion'>>;
  let mockPatientManagementService: jest.Mocked<Pick<PatientManagementService, 'getPatientById'>>;
  let mockAuditService: jest.Mocked<Pick<AuditService, 'record'>>;
  let service: VisitReminderConsentService;

  beforeEach(() => {
    mockRepository = {
      findByPatient: jest.fn().mockResolvedValue(null),
      grant: jest.fn().mockResolvedValue(GRANTED_RECORD),
      revoke: jest.fn().mockResolvedValue({
        ...GRANTED_RECORD,
        isGranted: false,
        revokedAt: new Date(),
        revokedReason: 'PATIENT_KEYWORD',
      }),
    };
    mockPrivacyNoticeRepository = {
      findCurrentVersion: jest.fn().mockResolvedValue({ id: 'notice-1', version: '1.0' } as never),
    };
    mockPatientManagementService = { getPatientById: jest.fn().mockResolvedValue({} as never) };
    mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new VisitReminderConsentService(
      mockRepository as unknown as PatientVisitReminderConsentRepository,
      mockPrivacyNoticeRepository as unknown as PrivacyNoticeRepository,
      mockPatientManagementService as unknown as PatientManagementService,
      mockAuditService as unknown as AuditService,
    );
  });

  it('answers null for a patient who was never asked', async () => {
    const actual = await service.getConsent(PATIENT_ID, CURRENT_USER);

    expect(actual).toEqual({ patientId: PATIENT_ID, consent: null });
    expect(mockPatientManagementService.getPatientById).toHaveBeenCalledWith(
      PATIENT_ID,
      CURRENT_USER,
    );
  });

  it('captures against the notice in force and audits the clerk', async () => {
    const actual = await service.upsertConsent(PATIENT_ID, { isGranted: true }, CURRENT_USER);

    expect(mockRepository.grant).toHaveBeenCalledWith({
      patientId: PATIENT_ID,
      noticeVersionId: 'notice-1',
      grantedById: 'user-clerk',
      grantedAt: expect.any(Date),
    });
    expect(actual.consent).toEqual(
      expect.objectContaining({
        purpose: 'VISIT_REMINDER',
        isGranted: true,
        noticeVersion: { id: 'notice-1', version: '1.0' },
      }),
    );
    expect(mockAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'VISIT_REMINDER_CONSENT_GRANTED',
        actorUserId: 'user-clerk',
      }),
    );
  });

  it('withdraws at the counter with reason STAFF', async () => {
    await service.upsertConsent(PATIENT_ID, { isGranted: false }, CURRENT_USER);

    expect(mockRepository.revoke).toHaveBeenCalledWith({
      patientId: PATIENT_ID,
      revokedReason: 'STAFF',
      revokedAt: expect.any(Date),
    });
    expect(mockAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VISIT_REMINDER_CONSENT_WITHDRAWN' }),
    );
  });

  it('revokes on STOP for every proven patient, audited with no actor', async () => {
    const revokedAt = new Date('2026-10-02T03:00:00.000Z');

    await service.revokeByPatientKeyword([PATIENT_ID, 'patient-sister'], revokedAt);

    expect(mockRepository.revoke.mock.calls.map(([data]) => data)).toEqual([
      { patientId: PATIENT_ID, revokedReason: 'PATIENT_KEYWORD', revokedAt },
      { patientId: 'patient-sister', revokedReason: 'PATIENT_KEYWORD', revokedAt },
    ]);
    expect(mockAuditService.record).toHaveBeenCalledTimes(2);
    expect(mockAuditService.record.mock.calls[0]?.[0]).not.toHaveProperty('actorUserId');
  });
});
