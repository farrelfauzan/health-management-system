import { buildDoctorDisplayName } from '@hms/shared-types';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { DoctorCredentialOptionRepository } from '../repository/doctor-credential-option.repository';
import { DoctorCredentialOptionService } from './doctor-credential-option.service';

function buildOption(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '2f6f4e6a-1a1a-4d1a-9a1a-1a1a1a1a1a1a',
    kind: 'DEGREE',
    code: 'SP_PD',
    label: 'Sp.PD',
    sortOrder: 100,
    isActive: true,
    createdAt: new Date('2026-09-10T02:00:00.000Z'),
    updatedAt: new Date('2026-09-10T02:00:00.000Z'),
    ...overrides,
  };
}

describe('DoctorCredentialOptionService', () => {
  const repositoryMock = {
    listOptions: jest.fn(),
    findOptionById: jest.fn(),
    findOptionByKindAndCode: jest.fn(),
    createOption: jest.fn(),
    updateOption: jest.fn(),
  } as unknown as DoctorCredentialOptionRepository;

  const auditServiceMock = {
    record: jest.fn(),
  } as unknown as AuditService;

  const service = new DoctorCredentialOptionService(repositoryMock, auditServiceMock);

  const currentUser = {
    sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    email: 'admin@hms.local',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listOptions', () => {
    it('asks the repository for one kind, active only, and serialises dates', async () => {
      (repositoryMock.listOptions as jest.Mock).mockResolvedValue([buildOption()]);

      const actualOptions = await service.listOptions({ kind: 'DEGREE' });

      expect(repositoryMock.listOptions).toHaveBeenCalledWith({ kind: 'DEGREE' });
      expect(actualOptions).toEqual([
        {
          id: '2f6f4e6a-1a1a-4d1a-9a1a-1a1a1a1a1a1a',
          kind: 'DEGREE',
          code: 'SP_PD',
          label: 'Sp.PD',
          sortOrder: 100,
          isActive: true,
          createdAt: '2026-09-10T02:00:00.000Z',
          updatedAt: '2026-09-10T02:00:00.000Z',
        },
      ]);
    });
  });

  describe('createOption', () => {
    it('rejects a code that already exists for that kind', async () => {
      (repositoryMock.findOptionByKindAndCode as jest.Mock).mockResolvedValue(buildOption());

      await expect(
        service.createOption(
          { kind: 'DEGREE', code: 'SP_PD', label: 'Sp.PD', sortOrder: 0 },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repositoryMock.createOption).not.toHaveBeenCalled();
    });

    it('records an audit row naming the new option', async () => {
      (repositoryMock.findOptionByKindAndCode as jest.Mock).mockResolvedValue(null);
      (repositoryMock.createOption as jest.Mock).mockResolvedValue(
        buildOption({ code: 'SP_GK', label: 'Sp.GK' }),
      );

      await service.createOption(
        { kind: 'DEGREE', code: 'SP_GK', label: 'Sp.GK', sortOrder: 270 },
        currentUser,
      );

      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          resource: 'DoctorCredentialOption',
          metadata: expect.objectContaining({ code: 'SP_GK' }),
        }),
      );
    });
  });

  describe('updateOption', () => {
    it('refuses an id that names no option', async () => {
      (repositoryMock.findOptionById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateOption('2f6f4e6a-1a1a-4d1a-9a1a-1a1a1a1a1a1a', { isActive: false }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('audits a deactivation with the old and the new value', async () => {
      (repositoryMock.findOptionById as jest.Mock).mockResolvedValue(buildOption());
      (repositoryMock.updateOption as jest.Mock).mockResolvedValue(
        buildOption({ isActive: false }),
      );

      await service.updateOption(
        '2f6f4e6a-1a1a-4d1a-9a1a-1a1a1a1a1a1a',
        { isActive: false },
        currentUser,
      );

      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          metadata: expect.objectContaining({ isActive: { from: true, to: false } }),
        }),
      );
    });
  });

  describe('assertUsableCodes', () => {
    beforeEach(() => {
      (repositoryMock.listOptions as jest.Mock).mockResolvedValue([
        buildOption(),
        buildOption({ code: 'SP_KK', label: 'Sp.KK', isActive: false }),
      ]);
    });

    it('accepts an active code', async () => {
      await expect(
        service.assertUsableCodes({ kind: 'DEGREE', codes: ['SP_PD'], field: 'degrees' }),
      ).resolves.toBeUndefined();
    });

    it('rejects an unknown code and names it in the error details', async () => {
      const actualError = await service
        .assertUsableCodes({ kind: 'DEGREE', codes: ['SP_MADE_UP'], field: 'degrees' })
        .catch((error: unknown) => error);

      expect(actualError).toBeInstanceOf(BadRequestException);
      expect((actualError as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({
          details: { field: 'degrees', unknownCodes: ['SP_MADE_UP'] },
        }),
      );
    });

    it('rejects a deactivated code the record does not already hold', async () => {
      await expect(
        service.assertUsableCodes({ kind: 'DEGREE', codes: ['SP_KK'], field: 'degrees' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps a deactivated code the record already holds, so the profile stays saveable', async () => {
      await expect(
        service.assertUsableCodes({
          kind: 'DEGREE',
          codes: ['SP_KK'],
          field: 'degrees',
          retainedCodes: ['SP_KK'],
        }),
      ).resolves.toBeUndefined();
    });

    it('skips the catalog read entirely for an empty list', async () => {
      await service.assertUsableCodes({ kind: 'DEGREE', codes: [], field: 'degrees' });

      expect(repositoryMock.listOptions).not.toHaveBeenCalled();
    });
  });

  describe('buildResolver', () => {
    beforeEach(() => {
      (repositoryMock.listOptions as jest.Mock).mockResolvedValue([
        buildOption({ kind: 'TITLE', code: 'DR', label: 'dr.' }),
        buildOption(),
        buildOption({ code: 'SP_KK', label: 'Sp.KK', isActive: false }),
      ]);
    });

    it('reads the whole catalog once, deactivated options included', async () => {
      await service.buildResolver();

      expect(repositoryMock.listOptions).toHaveBeenCalledTimes(1);
      expect(repositoryMock.listOptions).toHaveBeenCalledWith({ includeInactive: true });
    });

    it('resolves a stored code to its printed label', async () => {
      const resolveCredential = await service.buildResolver();

      expect(resolveCredential('DEGREE', 'SP_PD')).toEqual({
        code: 'SP_PD',
        label: 'Sp.PD',
        isLegacy: false,
      });
    });

    it('resolves a deactivated code, so an existing holder still prints correctly', async () => {
      const resolveCredential = await service.buildResolver();

      expect(resolveCredential('DEGREE', 'SP_KK')).toEqual({
        code: 'SP_KK',
        label: 'Sp.KK',
        isLegacy: false,
      });
    });

    it('recovers legacy free text by a case-insensitive label match', async () => {
      const resolveCredential = await service.buildResolver();

      expect(resolveCredential('DEGREE', 'sp.pd')).toEqual({
        code: 'SP_PD',
        label: 'Sp.PD',
        isLegacy: false,
      });
    });

    it('returns free text that matches nothing verbatim, flagged legacy', async () => {
      const resolveCredential = await service.buildResolver();

      expect(resolveCredential('DEGREE', 'Spesialis Penyakit Dalam')).toEqual({
        label: 'Spesialis Penyakit Dalam',
        isLegacy: true,
      });
    });

    it('never matches a code across kinds', async () => {
      const resolveCredential = await service.buildResolver();

      expect(resolveCredential('TITLE', 'SP_PD')).toEqual({
        label: 'SP_PD',
        isLegacy: true,
      });
    });
  });
});

describe('buildDoctorDisplayName', () => {
  it('places the title before the name and the degrees after it', () => {
    expect(
      buildDoctorDisplayName({
        title: 'dr.',
        fullName: 'Andi Prasetyo',
        degrees: ['Sp.PD', 'M.Kes'],
      }),
    ).toBe('dr. Andi Prasetyo, Sp.PD, M.Kes');
  });

  it('leaves a bare name alone when nothing else is on file', () => {
    expect(buildDoctorDisplayName({ fullName: 'Yusuf Hidayat' })).toBe('Yusuf Hidayat');
  });

  it('does not repeat honorifics a legacy full name already carries', () => {
    expect(
      buildDoctorDisplayName({
        title: 'dr.',
        fullName: 'dr. Andi Prasetyo, Sp.PD',
        degrees: ['Sp.PD'],
      }),
    ).toBe('dr. Andi Prasetyo, Sp.PD');
  });
});
