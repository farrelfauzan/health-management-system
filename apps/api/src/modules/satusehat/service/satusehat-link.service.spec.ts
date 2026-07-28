import {
  BadGatewayException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { SatusehatMasterDataClient } from '../../../common/satusehat/satusehat-master-data.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { SatusehatLinkRepository } from '../repository/satusehat-link.repository';
import { SatusehatLinkService } from './satusehat-link.service';

describe('SatusehatLinkService', () => {
  const repositoryMock = {
    findPatientLinkTarget: jest.fn(),
    savePatientIhsNumber: jest.fn(),
    findDoctorLinkTarget: jest.fn(),
    saveDoctorIhsNumber: jest.fn(),
  };
  const masterDataClientMock = {
    findPatientIhsNumberByNik: jest.fn(),
    findPractitionerIhsNumberByNik: jest.fn(),
  };
  const auditServiceMock = {
    record: jest.fn(),
  };
  const currentUser: CurrentUser = { sub: 'actor-user', email: 'admin@clinic.test' };
  const patientId = 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0';
  const doctorId = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
  const syntheticNik = '3204124101900002';

  const service = new SatusehatLinkService(
    repositoryMock as unknown as SatusehatLinkRepository,
    masterDataClientMock as unknown as SatusehatMasterDataClient,
    auditServiceMock as unknown as AuditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('linkPatient', () => {
    it('resolves the IHS number by NIK, stores it, and audits the linkage', async () => {
      repositoryMock.findPatientLinkTarget.mockResolvedValue({
        id: patientId,
        nik: syntheticNik,
        hasSatusehatPatientId: false,
      });
      masterDataClientMock.findPatientIhsNumberByNik.mockResolvedValue('P02478375538');

      const actualResult = await service.linkPatient(patientId, currentUser);

      expect(actualResult).toEqual({
        patientId,
        hasSatusehatPatientId: true,
        alreadyLinked: false,
      });
      expect(masterDataClientMock.findPatientIhsNumberByNik).toHaveBeenCalledWith(syntheticNik);
      expect(repositoryMock.savePatientIhsNumber).toHaveBeenCalledWith({
        patientId,
        ihsNumber: 'P02478375538',
      });
      expect(auditServiceMock.record).toHaveBeenCalledWith({
        action: 'SATUSEHAT_PATIENT_LINKED',
        resource: 'PatientProfile',
        resourceId: patientId,
        actorUserId: 'actor-user',
        metadata: { lookup: 'NIK' },
      });
    });

    it('returns the current state without an upstream call when already linked', async () => {
      repositoryMock.findPatientLinkTarget.mockResolvedValue({
        id: patientId,
        nik: syntheticNik,
        hasSatusehatPatientId: true,
      });

      const actualResult = await service.linkPatient(patientId, currentUser);

      expect(actualResult).toEqual({
        patientId,
        hasSatusehatPatientId: true,
        alreadyLinked: true,
      });
      expect(masterDataClientMock.findPatientIhsNumberByNik).not.toHaveBeenCalled();
      expect(repositoryMock.savePatientIhsNumber).not.toHaveBeenCalled();
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown patient', async () => {
      repositoryMock.findPatientLinkTarget.mockResolvedValue(null);

      await expect(service.linkPatient(patientId, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntity when the patient has no NIK', async () => {
      repositoryMock.findPatientLinkTarget.mockResolvedValue({
        id: patientId,
        nik: null,
        hasSatusehatPatientId: false,
      });

      await expect(service.linkPatient(patientId, currentUser)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(masterDataClientMock.findPatientIhsNumberByNik).not.toHaveBeenCalled();
    });

    it('throws NotFound when the master patient index has no match', async () => {
      repositoryMock.findPatientLinkTarget.mockResolvedValue({
        id: patientId,
        nik: syntheticNik,
        hasSatusehatPatientId: false,
      });
      masterDataClientMock.findPatientIhsNumberByNik.mockResolvedValue(null);

      await expect(service.linkPatient(patientId, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repositoryMock.savePatientIhsNumber).not.toHaveBeenCalled();
    });

    it('maps SATUSEHAT_NOT_CONFIGURED to ServiceUnavailable', async () => {
      repositoryMock.findPatientLinkTarget.mockResolvedValue({
        id: patientId,
        nik: syntheticNik,
        hasSatusehatPatientId: false,
      });
      masterDataClientMock.findPatientIhsNumberByNik.mockRejectedValue(
        new SatusehatError('SATUSEHAT_NOT_CONFIGURED', 'not configured'),
      );

      await expect(service.linkPatient(patientId, currentUser)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('maps upstream transport failures to BadGateway', async () => {
      repositoryMock.findPatientLinkTarget.mockResolvedValue({
        id: patientId,
        nik: syntheticNik,
        hasSatusehatPatientId: false,
      });
      masterDataClientMock.findPatientIhsNumberByNik.mockRejectedValue(
        new SatusehatError('SATUSEHAT_CIRCUIT_OPEN', 'circuit open'),
      );

      await expect(service.linkPatient(patientId, currentUser)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('linkDoctor', () => {
    it('resolves the practitioner IHS number by NIK, stores it, and audits the linkage', async () => {
      repositoryMock.findDoctorLinkTarget.mockResolvedValue({
        id: doctorId,
        nik: syntheticNik,
        satusehatPractitionerId: null,
      });
      masterDataClientMock.findPractitionerIhsNumberByNik.mockResolvedValue('N10000001');

      const actualResult = await service.linkDoctor(doctorId, currentUser);

      expect(actualResult).toEqual({
        doctorId,
        satusehatPractitionerId: 'N10000001',
        alreadyLinked: false,
      });
      expect(repositoryMock.saveDoctorIhsNumber).toHaveBeenCalledWith({
        doctorId,
        ihsNumber: 'N10000001',
      });
      expect(auditServiceMock.record).toHaveBeenCalledWith({
        action: 'SATUSEHAT_DOCTOR_LINKED',
        resource: 'DoctorProfile',
        resourceId: doctorId,
        actorUserId: 'actor-user',
        metadata: { lookup: 'NIK' },
      });
    });

    it('returns the stored IHS number without an upstream call when already linked', async () => {
      repositoryMock.findDoctorLinkTarget.mockResolvedValue({
        id: doctorId,
        nik: syntheticNik,
        satusehatPractitionerId: 'N10000001',
      });

      const actualResult = await service.linkDoctor(doctorId, currentUser);

      expect(actualResult).toEqual({
        doctorId,
        satusehatPractitionerId: 'N10000001',
        alreadyLinked: true,
      });
      expect(masterDataClientMock.findPractitionerIhsNumberByNik).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown doctor', async () => {
      repositoryMock.findDoctorLinkTarget.mockResolvedValue(null);

      await expect(service.linkDoctor(doctorId, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntity when the doctor has no NIK', async () => {
      repositoryMock.findDoctorLinkTarget.mockResolvedValue({
        id: doctorId,
        nik: null,
        satusehatPractitionerId: null,
      });

      await expect(service.linkDoctor(doctorId, currentUser)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('throws NotFound when the practitioner index has no match', async () => {
      repositoryMock.findDoctorLinkTarget.mockResolvedValue({
        id: doctorId,
        nik: syntheticNik,
        satusehatPractitionerId: null,
      });
      masterDataClientMock.findPractitionerIhsNumberByNik.mockResolvedValue(null);

      await expect(service.linkDoctor(doctorId, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repositoryMock.saveDoctorIhsNumber).not.toHaveBeenCalled();
    });
  });
});
