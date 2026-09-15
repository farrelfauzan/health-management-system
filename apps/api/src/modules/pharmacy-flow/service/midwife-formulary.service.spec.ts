import { MidwifeFormularyCandidateRecord, MidwifeFormularyItemRecord } from '@hms/shared-types';
import { UnprocessableEntityException } from '@nestjs/common';

import { SatusehatKfaClient } from '../../../common/satusehat/satusehat-kfa.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { MidwifeFormularyRepository } from '../repository/midwife-formulary.repository';
import { MidwifeFormularyService } from './midwife-formulary.service';

const IRON_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_IRON_ID = '22222222-2222-4222-8222-222222222222';
const AMOXICILLIN_ID = '33333333-3333-4333-8333-333333333333';
const FLAGGED_IRON_ID = '44444444-4444-4444-8444-444444444444';

const IRON_ITEM: MidwifeFormularyItemRecord = {
  id: 'item-iron',
  code: 'FE_PREGNANCY',
  displayName: 'Tablet tambah darah',
  group: 'OWN_AUTHORITY',
  regulationBasis: 'Permenkes 28/2017 Pasal 19 ayat (3) huruf e',
  kfaCodes: ['93015491'],
  kfaTemplateCodes: ['92000653'],
  matchKeywords: ['ferrous'],
  sortOrder: 10,
  createdAt: new Date('2026-09-15T00:00:00.000Z'),
  updatedAt: new Date('2026-09-15T00:00:00.000Z'),
};

const MEDICATIONS: MidwifeFormularyCandidateRecord[] = [
  { id: IRON_ID, name: 'Tablet Tambah Darah', kfaCode: '93015491', isMidwifePrescribable: false },
  { id: OTHER_IRON_ID, name: 'Sangobion', kfaCode: '93027609', isMidwifePrescribable: false },
  {
    id: AMOXICILLIN_ID,
    name: 'Amoxicillin 500 mg',
    kfaCode: '93007575',
    isMidwifePrescribable: false,
  },
  { id: FLAGGED_IRON_ID, name: 'Ferrous sulfate', kfaCode: null, isMidwifePrescribable: true },
];

describe('MidwifeFormularyService', () => {
  const repositoryMock = {
    listItems: jest.fn(),
    listCandidateMedications: jest.fn(),
    flagMidwifePrescribable: jest.fn(),
  };
  const kfaClientMock = { getProduct: jest.fn() };
  let service: MidwifeFormularyService;

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.listItems.mockResolvedValue([IRON_ITEM]);
    repositoryMock.listCandidateMedications.mockResolvedValue(MEDICATIONS);
    repositoryMock.flagMidwifePrescribable.mockResolvedValue(1);
    kfaClientMock.getProduct.mockImplementation(async (kfaCode: string) =>
      kfaCode === '93027609'
        ? { kfaCode, templateKfaCode: '92000653' }
        : { kfaCode, templateKfaCode: '92009999' },
    );
    service = new MidwifeFormularyService(
      repositoryMock as unknown as MidwifeFormularyRepository,
      kfaClientMock as unknown as SatusehatKfaClient,
    );
  });

  describe('previewFormulary', () => {
    it('asks KFA only about codes the exact lists do not cover', async () => {
      await service.previewFormulary();

      const actualCodes = kfaClientMock.getProduct.mock.calls.map((call) => call[0]);
      expect(actualCodes.sort()).toEqual(['93007575', '93027609']);
    });

    it('matches by exact code, by template, and suggests by keyword', async () => {
      const actual = await service.previewFormulary();

      expect(actual.templateLookup).toBe('COMPLETED');
      expect(actual.items[0]?.matches).toEqual([
        expect.objectContaining({ medicationId: IRON_ID, matchedBy: 'KFA_CODE' }),
        expect.objectContaining({ medicationId: OTHER_IRON_ID, matchedBy: 'KFA_TEMPLATE' }),
        expect.objectContaining({ medicationId: FLAGGED_IRON_ID, matchedBy: 'KEYWORD' }),
      ]);
      expect(actual.unmatchedItems).toEqual([]);
    });

    it('degrades to exact codes and says so when the platform is not configured', async () => {
      kfaClientMock.getProduct.mockRejectedValue(
        new SatusehatError('SATUSEHAT_NOT_CONFIGURED', 'not configured'),
      );

      const actual = await service.previewFormulary();

      expect(actual.templateLookup).toBe('SKIPPED');
      expect(actual.items[0]?.matches.map((match) => match.medicationId)).toEqual([
        IRON_ID,
        FLAGGED_IRON_ID,
      ]);
    });
  });

  describe('applyFormulary', () => {
    it('flags the chosen matched rows and reports each outcome', async () => {
      const actual = await service.applyFormulary({ medicationIds: [IRON_ID, OTHER_IRON_ID] });

      expect(repositoryMock.flagMidwifePrescribable).toHaveBeenCalledWith([IRON_ID, OTHER_IRON_ID]);
      expect(actual).toEqual({
        flaggedCount: 2,
        alreadyFlaggedCount: 0,
        items: [
          { medicationId: IRON_ID, outcome: 'FLAGGED' },
          { medicationId: OTHER_IRON_ID, outcome: 'FLAGGED' },
        ],
      });
    });

    it('refuses an id outside the recomputed preview with 422 and writes nothing', async () => {
      const actualError = await service
        .applyFormulary({ medicationIds: [IRON_ID, AMOXICILLIN_ID] })
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(UnprocessableEntityException);
      expect((actualError as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'MIDWIFE_FORMULARY_MEDICATION_NOT_MATCHED',
        errors: { medicationIds: [AMOXICILLIN_ID] },
      });
      expect(repositoryMock.flagMidwifePrescribable).not.toHaveBeenCalled();
    });

    it('never accepts a keyword suggestion, even one already flagged', async () => {
      await expect(
        service.applyFormulary({ medicationIds: [FLAGGED_IRON_ID] }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repositoryMock.flagMidwifePrescribable).not.toHaveBeenCalled();
    });

    it('reports an already-flagged row as ALREADY_FLAGGED without touching it', async () => {
      repositoryMock.listCandidateMedications.mockResolvedValue([
        { ...MEDICATIONS[0], isMidwifePrescribable: true },
        MEDICATIONS[1],
      ]);

      const actual = await service.applyFormulary({
        medicationIds: [IRON_ID, OTHER_IRON_ID, IRON_ID],
      });

      expect(repositoryMock.flagMidwifePrescribable).toHaveBeenCalledWith([OTHER_IRON_ID]);
      expect(actual).toEqual({
        flaggedCount: 1,
        alreadyFlaggedCount: 1,
        items: [
          { medicationId: IRON_ID, outcome: 'ALREADY_FLAGGED' },
          { medicationId: OTHER_IRON_ID, outcome: 'FLAGGED' },
        ],
      });
    });

    it('performs no write at all when every chosen row is already flagged', async () => {
      repositoryMock.listCandidateMedications.mockResolvedValue([
        { ...MEDICATIONS[0], isMidwifePrescribable: true },
      ]);

      const actual = await service.applyFormulary({ medicationIds: [IRON_ID] });

      expect(repositoryMock.flagMidwifePrescribable).not.toHaveBeenCalled();
      expect(actual.flaggedCount).toBe(0);
      expect(actual.alreadyFlaggedCount).toBe(1);
    });
  });
});
