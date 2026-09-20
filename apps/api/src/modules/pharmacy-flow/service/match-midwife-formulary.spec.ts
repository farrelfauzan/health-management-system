import { MidwifeFormularyCandidateRecord, MidwifeFormularyItemRecord } from '@hms/shared-types';

import { matchMidwifeFormulary } from './match-midwife-formulary';

const IRON_ITEM: MidwifeFormularyItemRecord = {
  id: 'item-iron',
  code: 'FE_PREGNANCY',
  displayName: 'Tablet tambah darah',
  group: 'OWN_AUTHORITY',
  authorityKind: null,
  regulationBasis: 'Permenkes 28/2017 Pasal 19 ayat (3) huruf e',
  kfaCodes: ['93015491'],
  kfaTemplateCodes: ['92000653'],
  matchKeywords: ['tablet tambah darah', 'ferrous'],
  sortOrder: 10,
  createdAt: new Date('2026-09-15T00:00:00.000Z'),
  updatedAt: new Date('2026-09-15T00:00:00.000Z'),
};

const VITAMIN_K_ITEM: MidwifeFormularyItemRecord = {
  ...IRON_ITEM,
  id: 'item-vitk',
  code: 'VIT_K1_NEWBORN',
  displayName: 'Vitamin K1 injeksi',
  kfaCodes: ['93006337'],
  kfaTemplateCodes: ['92000971'],
  matchKeywords: ['phytomenadione', 'vitamin k'],
  sortOrder: 40,
};

function buildMedication(
  overrides: Partial<MidwifeFormularyCandidateRecord>,
): MidwifeFormularyCandidateRecord {
  return {
    id: 'med-1',
    name: 'Tablet Tambah Darah',
    kfaCode: '93015491',
    isMidwifePrescribable: false,
    ...overrides,
  };
}

describe('matchMidwifeFormulary', () => {
  it('matches a catalog row whose product code is in the item list as KFA_CODE', () => {
    const inputMedication = buildMedication({});

    const actual = matchMidwifeFormulary({
      items: [IRON_ITEM, VITAMIN_K_ITEM],
      medications: [inputMedication],
      templateCodesByKfaCode: new Map(),
    });

    expect(actual.items).toEqual([
      {
        item: IRON_ITEM,
        matches: [
          {
            medicationId: 'med-1',
            name: 'Tablet Tambah Darah',
            kfaCode: '93015491',
            isMidwifePrescribable: false,
            authorityKind: null,
            matchedBy: 'KFA_CODE',
          },
        ],
      },
    ]);
    expect(actual.unmatchedItems).toEqual([VITAMIN_K_ITEM]);
  });

  it('matches another manufacturer of the same generic through the template code', () => {
    const inputMedication = buildMedication({
      id: 'med-2',
      name: 'Sangobion Fe',
      kfaCode: '93027609',
    });

    const actual = matchMidwifeFormulary({
      items: [IRON_ITEM],
      medications: [inputMedication],
      templateCodesByKfaCode: new Map([['93027609', '92000653']]),
    });

    expect(actual.items[0]?.matches).toEqual([
      expect.objectContaining({ medicationId: 'med-2', matchedBy: 'KFA_TEMPLATE' }),
    ]);
  });

  it('prefers the exact code over the template when both apply', () => {
    const actual = matchMidwifeFormulary({
      items: [IRON_ITEM],
      medications: [buildMedication({})],
      templateCodesByKfaCode: new Map([['93015491', '92000653']]),
    });

    expect(actual.items[0]?.matches[0]?.matchedBy).toBe('KFA_CODE');
  });

  it('only suggests a row by name, case-insensitively, when no code applies', () => {
    const inputMedication = buildMedication({
      id: 'med-3',
      name: 'FERROUS sulfate 300 mg',
      kfaCode: null,
    });

    const actual = matchMidwifeFormulary({
      items: [IRON_ITEM],
      medications: [inputMedication],
      templateCodesByKfaCode: new Map(),
    });

    expect(actual.items[0]?.matches).toEqual([
      expect.objectContaining({ medicationId: 'med-3', kfaCode: null, matchedBy: 'KEYWORD' }),
    ]);
  });

  it('leaves a row that matches nothing out of every item', () => {
    const inputMedication = buildMedication({
      id: 'med-4',
      name: 'Amoxicillin 500 mg',
      kfaCode: '93007575',
    });

    const actual = matchMidwifeFormulary({
      items: [IRON_ITEM, VITAMIN_K_ITEM],
      medications: [inputMedication],
      templateCodesByKfaCode: new Map([['93007575', '92001234']]),
    });

    expect(actual.items).toEqual([]);
    expect(actual.unmatchedItems).toEqual([IRON_ITEM, VITAMIN_K_ITEM]);
  });

  it('carries the already-flagged state through so the dialog can disable the row', () => {
    const actual = matchMidwifeFormulary({
      items: [IRON_ITEM],
      medications: [buildMedication({ isMidwifePrescribable: true })],
      templateCodesByKfaCode: new Map(),
    });

    expect(actual.items[0]?.matches[0]?.isMidwifePrescribable).toBe(true);
  });
});
