import { TaxSettingsRecord } from '@hms/shared-types';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { TaxSettingsRepository } from '../repository/tax-settings.repository';
import { TaxSettingsService } from './tax-settings.service';

const VALID_NPWP = '0012345678901000';

describe('TaxSettingsService', () => {
  const taxSettingsRepositoryMock = { findTaxSettings: jest.fn(), saveTaxSettings: jest.fn() };
  const clinicProfileServiceMock = { getTaxId: jest.fn() };
  const auditServiceMock = { record: jest.fn() };
  const configServiceMock = { get: jest.fn().mockReturnValue('Asia/Jakarta') };

  const service = new TaxSettingsService(
    taxSettingsRepositoryMock as unknown as TaxSettingsRepository,
    clinicProfileServiceMock as unknown as ClinicProfileService,
    auditServiceMock as unknown as AuditService,
    configServiceMock as unknown as ConfigService,
  );

  const actor = { sub: 'a1b2c3d4-0000-4000-8000-000000000001' } as CurrentUser;

  function buildRecord(overrides: Partial<TaxSettingsRecord> = {}): TaxSettingsRecord {
    return {
      taxpayerType: null,
      incomeTaxRegime: 'GENERAL',
      pp55StartYear: null,
      isPkp: false,
      pkpSince: null,
      nitku: null,
      updatedById: null,
      updatedAt: null,
      ...overrides,
    };
  }

  function echoSavedPayload(): void {
    taxSettingsRepositoryMock.saveTaxSettings.mockImplementation((payload) =>
      Promise.resolve({ ...payload, updatedAt: new Date('2026-09-19T03:00:00.000Z') }),
    );
  }

  async function captureError(action: () => Promise<unknown>): Promise<BadRequestException> {
    try {
      await action();
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        return err;
      }
      throw err;
    }
    throw new Error('Expected a BadRequestException');
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-09-19T03:00:00.000Z'));
    taxSettingsRepositoryMock.findTaxSettings.mockResolvedValue(null);
    clinicProfileServiceMock.getTaxId.mockResolvedValue(VALID_NPWP);
    echoSavedPayload();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads the defaults, with the NPWP status, for a clinic that never saved a profile', async () => {
    clinicProfileServiceMock.getTaxId.mockResolvedValue('01.234.567.8-901.000');

    const actual = await service.getTaxSettingsView();

    expect(actual).toEqual({
      incomeTaxRegime: 'GENERAL',
      isPkp: false,
      npwp: '01.234.567.8-901.000',
      npwpStatus: 'LEGACY_15_DIGIT',
    });
  });

  it('refuses PT on PP 55 without a start year, with the ticket error code', async () => {
    const actual = await captureError(() =>
      service.updateTaxSettings({ taxpayerType: 'PT', incomeTaxRegime: 'PP55_FINAL' }, actor),
    );

    expect(actual.getResponse()).toMatchObject({ code: 'TAX_PP55_NOT_ELIGIBLE' });
    expect(taxSettingsRepositoryMock.saveTaxSettings).not.toHaveBeenCalled();
  });

  it('saves an eligible PT transition and reports its last year', async () => {
    const actual = await service.updateTaxSettings(
      { taxpayerType: 'PT', incomeTaxRegime: 'PP55_FINAL', pp55StartYear: 2025 },
      actor,
    );

    expect(actual).toMatchObject({ pp55StartYear: 2025, pp55LastEligibleYear: 2027 });
  });

  it('does not re-judge an expired PP 55 period on an unrelated change', async () => {
    taxSettingsRepositoryMock.findTaxSettings.mockResolvedValue(
      buildRecord({ taxpayerType: 'PT', incomeTaxRegime: 'PP55_FINAL', pp55StartYear: 2022 }),
    );

    const actual = await service.updateTaxSettings({ isPkp: true, pkpSince: '2026-09-01' }, actor);

    expect(actual.isPkp).toBe(true);
  });

  it('clears the start year when the clinic leaves PP 55', async () => {
    taxSettingsRepositoryMock.findTaxSettings.mockResolvedValue(
      buildRecord({
        taxpayerType: 'INDIVIDUAL',
        incomeTaxRegime: 'PP55_FINAL',
        pp55StartYear: 2024,
      }),
    );

    await service.updateTaxSettings({ incomeTaxRegime: 'GENERAL' }, actor);

    expect(taxSettingsRepositoryMock.saveTaxSettings).toHaveBeenCalledWith(
      expect.objectContaining({ incomeTaxRegime: 'GENERAL', pp55StartYear: null }),
    );
  });

  it('requires a registration date for a PKP and drops it for a non-PKP', async () => {
    const actualError = await captureError(() => service.updateTaxSettings({ isPkp: true }, actor));
    taxSettingsRepositoryMock.findTaxSettings.mockResolvedValue(
      buildRecord({ isPkp: true, pkpSince: '2026-01-02' }),
    );
    await service.updateTaxSettings({ isPkp: false }, actor);

    expect(actualError.getResponse()).toMatchObject({ code: 'TAX_PKP_SINCE_REQUIRED' });
    expect(taxSettingsRepositoryMock.saveTaxSettings).toHaveBeenCalledWith(
      expect.objectContaining({ isPkp: false, pkpSince: null }),
    );
  });

  it('refuses a NITKU that does not extend the clinic NPWP', async () => {
    const actual = await captureError(() =>
      service.updateTaxSettings({ nitku: '9912345678901000000000' }, actor),
    );

    expect(actual.getResponse()).toMatchObject({ code: 'TAX_NITKU_NPWP_MISMATCH' });
  });

  it('refuses any NITKU while the NPWP is still the 15-digit format', async () => {
    clinicProfileServiceMock.getTaxId.mockResolvedValue('01.234.567.8-901.000');

    const actual = await captureError(() =>
      service.updateTaxSettings({ nitku: `${VALID_NPWP}000000` }, actor),
    );

    expect(actual.getResponse()).toMatchObject({ code: 'TAX_NITKU_NPWP_MISMATCH' });
  });

  it('writes one TAX_SETTINGS_UPDATED row with the old and new value of each change', async () => {
    await service.updateTaxSettings({ isPkp: true, pkpSince: '2026-09-01' }, actor);

    expect(auditServiceMock.record).toHaveBeenCalledTimes(1);
    expect(auditServiceMock.record).toHaveBeenCalledWith({
      action: 'TAX_SETTINGS_UPDATED',
      resource: 'tax-settings',
      actorUserId: actor.sub,
      metadata: {
        changes: {
          isPkp: { from: false, to: true },
          pkpSince: { from: null, to: '2026-09-01' },
        },
      },
    });
  });

  it('writes no audit row when nothing changed', async () => {
    await service.updateTaxSettings({ isPkp: false }, actor);

    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });
});
