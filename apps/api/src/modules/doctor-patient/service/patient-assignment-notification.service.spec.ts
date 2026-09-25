import { NotificationHrefService } from '../../notification/service/notification-href.service';
import { NotificationService } from '../../notification/service/notification.service';
import { DoctorPatientRepository } from '../repository/doctor-patient.repository';
import { PatientAssignmentNotificationService } from './patient-assignment-notification.service';

/**
 * D-048. An assignment reaches each clinician with an account, in the shell
 * they can open, and never the person who made it.
 */
describe('PatientAssignmentNotificationService', () => {
  const notificationServiceMock = { createForUsers: jest.fn() };
  const hrefServiceMock = {
    groupUserIdsByShell: jest.fn(),
    buildPatientHref: jest.fn(),
  };
  const repositoryMock = { findActiveClinicianAccounts: jest.fn() };
  const service = new PatientAssignmentNotificationService(
    notificationServiceMock as unknown as NotificationService,
    hrefServiceMock as unknown as NotificationHrefService,
    repositoryMock as unknown as DoctorPatientRepository,
  );
  const inputNotice = {
    doctorIds: ['doctor-profile-1', 'doctor-profile-2', 'doctor-profile-3'],
    patientId: 'patient-1',
    patientName: 'Rina Wati',
    actorUserId: 'admin-user',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    notificationServiceMock.createForUsers.mockImplementation(
      async (userIds: string[]) => userIds.length,
    );
    hrefServiceMock.buildPatientHref.mockImplementation(
      (shell: string, patientId: string) => `/${shell}/patients/${patientId}`,
    );
  });

  it('tells each clinician with an account, linking the patient in their shell', async () => {
    repositoryMock.findActiveClinicianAccounts.mockResolvedValue([
      { doctorId: 'doctor-profile-1', ownerUserId: 'doctor-user' },
      { doctorId: 'doctor-profile-2', ownerUserId: null },
      { doctorId: 'doctor-profile-3', ownerUserId: 'midwife-user' },
    ]);
    hrefServiceMock.groupUserIdsByShell.mockResolvedValue(
      new Map([['doctor', ['doctor-user', 'midwife-user']]]),
    );

    const actualCount = await service.notifyAssigned(inputNotice);

    expect(actualCount).toBe(2);
    expect(hrefServiceMock.groupUserIdsByShell).toHaveBeenCalledWith(['doctor-user', 'midwife-user']);
    expect(notificationServiceMock.createForUsers).toHaveBeenCalledWith(
      ['doctor-user', 'midwife-user'],
      {
        type: 'PATIENT_ASSIGNED',
        titleKey: 'patientAssigned.title',
        bodyKey: 'patientAssigned.body',
        params: { patientName: 'Rina Wati' },
        href: '/doctor/patients/patient-1',
      },
    );
  });

  it('never tells a clinician about an assignment they made themselves', async () => {
    repositoryMock.findActiveClinicianAccounts.mockResolvedValue([
      { doctorId: 'doctor-profile-1', ownerUserId: 'admin-user' },
    ]);
    hrefServiceMock.groupUserIdsByShell.mockResolvedValue(new Map());

    const actualCount = await service.notifyAssigned(inputNotice);

    expect(actualCount).toBe(0);
    expect(hrefServiceMock.groupUserIdsByShell).toHaveBeenCalledWith([]);
  });

  it('writes one batch per shell for a clinician who sits in the admin shell', async () => {
    repositoryMock.findActiveClinicianAccounts.mockResolvedValue([
      { doctorId: 'doctor-profile-1', ownerUserId: 'doctor-user' },
      { doctorId: 'doctor-profile-3', ownerUserId: 'admin-doctor-user' },
    ]);
    hrefServiceMock.groupUserIdsByShell.mockResolvedValue(
      new Map([
        ['doctor', ['doctor-user']],
        ['admin', ['admin-doctor-user']],
      ]),
    );

    await service.notifyAssigned(inputNotice);

    expect(notificationServiceMock.createForUsers).toHaveBeenCalledWith(
      ['admin-doctor-user'],
      expect.objectContaining({ href: '/admin/patients/patient-1' }),
    );
  });

  it('does nothing when no clinician was named', async () => {
    const actualCount = await service.notifyAssigned({ ...inputNotice, doctorIds: [] });

    expect(actualCount).toBe(0);
    expect(repositoryMock.findActiveClinicianAccounts).not.toHaveBeenCalled();
  });

  it('never throws: a failed bell row must not undo an assignment', async () => {
    repositoryMock.findActiveClinicianAccounts.mockRejectedValue(new Error('down'));

    await expect(service.notifyAssigned(inputNotice)).resolves.toBe(0);
  });
});
