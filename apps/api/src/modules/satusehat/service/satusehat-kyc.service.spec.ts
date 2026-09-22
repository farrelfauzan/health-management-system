import { Logger } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { SatusehatKycClient } from '../../../common/satusehat/satusehat-kyc.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { SatusehatKycOperatorRepository } from '../repository/satusehat-kyc-operator.repository';
import { SatusehatKycService } from './satusehat-kyc.service';

/** Sixteen digits that are nobody's number. */
const NIK_PLACEHOLDER = '0000000000000000';
const ACTOR = { sub: 'operator-1', email: 'desk@klinik.id' } as const;
const PATIENT_ID = '4f1c2a9e-6b3d-4e8a-9c7f-1a2b3c4d5e6f';
const VALIDATION_URL = 'https://kyc.example/validate?token=secret-token-value';

function buildClient(overrides: Partial<jest.Mocked<SatusehatKycClient>> = {}) {
  return {
    getStatus: jest.fn().mockReturnValue({ isEnabled: true, disabledReason: null }),
    generateValidationUrl: jest
      .fn()
      .mockResolvedValue({ url: VALIDATION_URL, token: 'secret-token-value' }),
    ...overrides,
  } as unknown as jest.Mocked<SatusehatKycClient>;
}

function buildRepository(operator: { name: string | null; nik: string | null } | null) {
  return {
    findOperator: jest.fn().mockResolvedValue(operator),
  } as unknown as jest.Mocked<SatusehatKycOperatorRepository>;
}

function buildAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditService>;
}

describe('SatusehatKycService (P24-T16)', () => {
  const logSpies = ['log', 'warn', 'error', 'debug', 'verbose'].map((method) =>
    jest.spyOn(Logger.prototype, method as 'log').mockImplementation(() => undefined),
  );

  afterEach(() => {
    logSpies.forEach((spy) => spy.mockClear());
  });

  describe('getStatus', () => {
    it('is enabled when the keys are configured and the operator has a name and a NIK', async () => {
      const service = new SatusehatKycService(
        buildClient(),
        buildRepository({ name: 'Bidan Sari', nik: NIK_PLACEHOLDER }),
        buildAudit(),
      );

      await expect(service.getStatus(ACTOR)).resolves.toEqual({
        isEnabled: true,
        disabledReason: null,
        hasOperatorNik: true,
      });
    });

    it('reports the deployment reason first, even when the operator is complete', async () => {
      const service = new SatusehatKycService(
        buildClient({
          getStatus: jest
            .fn()
            .mockReturnValue({ isEnabled: false, disabledReason: 'KYC_KEYS_NOT_CONFIGURED' }),
        } as Partial<jest.Mocked<SatusehatKycClient>>),
        buildRepository({ name: 'Bidan Sari', nik: NIK_PLACEHOLDER }),
        buildAudit(),
      );

      await expect(service.getStatus(ACTOR)).resolves.toEqual({
        isEnabled: false,
        disabledReason: 'KYC_KEYS_NOT_CONFIGURED',
        hasOperatorNik: true,
      });
    });

    it('reports a missing operator NIK', async () => {
      const service = new SatusehatKycService(
        buildClient(),
        buildRepository({ name: 'Rani Putri', nik: null }),
        buildAudit(),
      );

      await expect(service.getStatus(ACTOR)).resolves.toEqual({
        isEnabled: false,
        disabledReason: 'OPERATOR_NIK_MISSING',
        hasOperatorNik: false,
      });
    });

    it('reports a missing operator name', async () => {
      const service = new SatusehatKycService(
        buildClient(),
        buildRepository({ name: null, nik: NIK_PLACEHOLDER }),
        buildAudit(),
      );

      await expect(service.getStatus(ACTOR)).resolves.toMatchObject({
        isEnabled: false,
        disabledReason: 'OPERATOR_NAME_MISSING',
      });
    });
  });

  describe('startSession', () => {
    it('sends the operator to the platform, returns the URL once, and audits without it', async () => {
      const client = buildClient();
      const audit = buildAudit();
      const service = new SatusehatKycService(
        client,
        buildRepository({ name: 'Bidan Sari', nik: NIK_PLACEHOLDER }),
        audit,
      );

      const actual = await service.startSession({ patientId: PATIENT_ID }, ACTOR);

      expect(actual).toEqual({ url: VALIDATION_URL, expiresAt: null });
      expect(client.generateValidationUrl).toHaveBeenCalledWith({
        name: 'Bidan Sari',
        nik: NIK_PLACEHOLDER,
      });
      expect(audit.record).toHaveBeenCalledTimes(1);
      const auditInput = audit.record.mock.calls[0]?.[0];
      expect(auditInput).toEqual({
        action: 'SATUSEHAT_KYC_STARTED',
        resource: 'satusehat-kyc',
        actorUserId: ACTOR.sub,
        patientId: PATIENT_ID,
        metadata: { outcome: 'STARTED' },
      });
      const serialised = JSON.stringify(auditInput);
      expect(serialised).not.toContain(NIK_PLACEHOLDER);
      expect(serialised).not.toContain('secret-token-value');
    });

    it('never lets the URL or the token reach the logger', async () => {
      const service = new SatusehatKycService(
        buildClient(),
        buildRepository({ name: 'Bidan Sari', nik: NIK_PLACEHOLDER }),
        buildAudit(),
      );

      await service.startSession({}, ACTOR);

      const logged = logSpies.flatMap((spy) => spy.mock.calls.map((call) => JSON.stringify(call)));
      expect(logged.join('\n')).not.toContain('secret-token-value');
      expect(logged.join('\n')).not.toContain(NIK_PLACEHOLDER);
    });

    it('refuses an operator without a NIK with 422 and calls nothing', async () => {
      const client = buildClient();
      const audit = buildAudit();
      const service = new SatusehatKycService(
        client,
        buildRepository({ name: 'Rani Putri', nik: null }),
        audit,
      );

      await expect(service.startSession({}, ACTOR)).rejects.toMatchObject({
        status: 422,
        response: { code: 'OPERATOR_NIK_MISSING' },
      });
      expect(client.generateValidationUrl).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refuses with 503 when the KYC keys are not configured', async () => {
      const service = new SatusehatKycService(
        buildClient({
          getStatus: jest
            .fn()
            .mockReturnValue({ isEnabled: false, disabledReason: 'KYC_KEYS_INCOMPLETE' }),
        } as Partial<jest.Mocked<SatusehatKycClient>>),
        buildRepository({ name: 'Bidan Sari', nik: NIK_PLACEHOLDER }),
        buildAudit(),
      );

      await expect(service.startSession({}, ACTOR)).rejects.toMatchObject({
        status: 503,
        response: { code: 'KYC_KEYS_INCOMPLETE' },
      });
    });

    it('audits a refused generate-url with the error code only, and answers 502', async () => {
      const audit = buildAudit();
      const service = new SatusehatKycService(
        buildClient({
          generateValidationUrl: jest
            .fn()
            .mockRejectedValue(
              new SatusehatError(
                'SATUSEHAT_KYC_REJECTED',
                'SATUSEHAT KYC rejected the request (code 400): agent_nik [NIK] is not registered',
              ),
            ),
        } as Partial<jest.Mocked<SatusehatKycClient>>),
        buildRepository({ name: 'Bidan Sari', nik: NIK_PLACEHOLDER }),
        audit,
      );

      await expect(service.startSession({ patientId: PATIENT_ID }, ACTOR)).rejects.toMatchObject({
        status: 502,
        response: { code: 'SATUSEHAT_KYC_REJECTED' },
      });
      expect(audit.record).toHaveBeenCalledWith({
        action: 'SATUSEHAT_KYC_STARTED',
        resource: 'satusehat-kyc',
        actorUserId: ACTOR.sub,
        patientId: PATIENT_ID,
        metadata: { outcome: 'FAILED', errorCode: 'SATUSEHAT_KYC_REJECTED' },
      });
    });

    it('answers 503 when the circuit is open', async () => {
      const service = new SatusehatKycService(
        buildClient({
          generateValidationUrl: jest
            .fn()
            .mockRejectedValue(new SatusehatError('SATUSEHAT_CIRCUIT_OPEN', 'open')),
        } as Partial<jest.Mocked<SatusehatKycClient>>),
        buildRepository({ name: 'Bidan Sari', nik: NIK_PLACEHOLDER }),
        buildAudit(),
      );

      await expect(service.startSession({}, ACTOR)).rejects.toMatchObject({ status: 503 });
    });
  });
});
