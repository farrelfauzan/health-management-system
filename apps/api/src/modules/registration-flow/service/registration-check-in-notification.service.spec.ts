import { NotificationHrefService } from '../../notification/service/notification-href.service';
import { NotificationService } from '../../notification/service/notification.service';
import { RegistrationFlowRepository } from '../repository/registration-flow.repository';
import { RegistrationCheckInNotificationService } from './registration-check-in-notification.service';

/**
 * D-048. A check-in reaches the clinician the visit is booked with, in the
 * shell they can open, and never the person who did the checking in.
 */
describe('RegistrationCheckInNotificationService', () => {
  const notificationServiceMock = { createForUser: jest.fn() };
  const hrefServiceMock = {
    resolveShellForUser: jest.fn(),
    buildCheckInQueueHref: jest.fn(),
  };
  const repositoryMock = { findActiveClinicianUserId: jest.fn() };
  const service = new RegistrationCheckInNotificationService(
    notificationServiceMock as unknown as NotificationService,
    hrefServiceMock as unknown as NotificationHrefService,
    repositoryMock as unknown as RegistrationFlowRepository,
  );
  const inputNotice = {
    registrationId: 'registration-1',
    doctorId: 'doctor-profile-1',
    patientName: 'Budi Santoso',
    poliName: 'Poli Umum',
    queueDate: '2026-09-25',
    actorUserId: 'front-desk-user',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    hrefServiceMock.buildCheckInQueueHref.mockImplementation(
      (shell: string, queueDate: string) => `/${shell}/queue/${queueDate}`,
    );
  });

  it('tells the clinician behind the booked profile, linking into their shell', async () => {
    repositoryMock.findActiveClinicianUserId.mockResolvedValue('clinician-user');
    hrefServiceMock.resolveShellForUser.mockResolvedValue('doctor');

    const actualCount = await service.notifyCheckedIn(inputNotice);

    expect(actualCount).toBe(1);
    expect(repositoryMock.findActiveClinicianUserId).toHaveBeenCalledWith('doctor-profile-1');
    expect(hrefServiceMock.buildCheckInQueueHref).toHaveBeenCalledWith('doctor', '2026-09-25');
    expect(notificationServiceMock.createForUser).toHaveBeenCalledWith({
      userId: 'clinician-user',
      type: 'PATIENT_CHECKED_IN',
      titleKey: 'patientCheckedIn.title',
      bodyKey: 'patientCheckedIn.body',
      params: { patientName: 'Budi Santoso', poliName: 'Poli Umum' },
      href: '/doctor/queue/2026-09-25',
    });
  });

  it('skips a clinician profile with no account', async () => {
    repositoryMock.findActiveClinicianUserId.mockResolvedValue(null);

    const actualCount = await service.notifyCheckedIn(inputNotice);

    expect(actualCount).toBe(0);
    expect(notificationServiceMock.createForUser).not.toHaveBeenCalled();
  });

  it('never tells the clinician about a check-in they made themselves', async () => {
    repositoryMock.findActiveClinicianUserId.mockResolvedValue('front-desk-user');

    const actualCount = await service.notifyCheckedIn(inputNotice);

    expect(actualCount).toBe(0);
    expect(hrefServiceMock.resolveShellForUser).not.toHaveBeenCalled();
  });

  it('skips an account whose shell no longer resolves', async () => {
    repositoryMock.findActiveClinicianUserId.mockResolvedValue('clinician-user');
    hrefServiceMock.resolveShellForUser.mockResolvedValue(null);

    await expect(service.notifyCheckedIn(inputNotice)).resolves.toBe(0);
    expect(notificationServiceMock.createForUser).not.toHaveBeenCalled();
  });

  it('never throws: a failed bell row must not undo a check-in', async () => {
    repositoryMock.findActiveClinicianUserId.mockRejectedValue(new Error('down'));

    await expect(service.notifyCheckedIn(inputNotice)).resolves.toBe(0);
  });
});
