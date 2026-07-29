import { BpjsReferenceCatalogValue } from '@hms/shared-types';

import { BpjsPcareReferenceCatalogDescriptor } from './bpjs-pcare-reference.types';

/**
 * Endpoint map for the eight PCare reference catalogs, pinned from the same
 * community reference implementations as the D-022 protocol facts. TINDAKAN
 * is served per kdTkp bucket ('10' rawat jalan, '20' rawat inap, '50'
 * promotif preventif); DIAGNOSA and DPHO are keyword lookups with no
 * enumeration endpoint, which is why they sync by search-and-cache instead of
 * the bulk sync button.
 */
export const BPJS_PCARE_REFERENCE_CATALOGS: Readonly<
  Record<BpjsReferenceCatalogValue, BpjsPcareReferenceCatalogDescriptor>
> = {
  POLI: {
    catalog: 'POLI',
    codeField: 'kdPoli',
    displayField: 'nmPoli',
    fetchPlan: {
      kind: 'PAGINATED',
      buildPath: (start: number, limit: number): string => `poli/fktp/${start}/${limit}`,
    },
  },
  DOKTER: {
    catalog: 'DOKTER',
    codeField: 'kdDokter',
    displayField: 'nmDokter',
    fetchPlan: {
      kind: 'PAGINATED',
      buildPath: (start: number, limit: number): string => `dokter/${start}/${limit}`,
    },
  },
  KESADARAN: {
    catalog: 'KESADARAN',
    codeField: 'kdSadar',
    displayField: 'nmSadar',
    fetchPlan: { kind: 'SINGLE', path: 'kesadaran' },
  },
  TINDAKAN: {
    catalog: 'TINDAKAN',
    codeField: 'kdTindakan',
    displayField: 'nmTindakan',
    fetchPlan: {
      kind: 'GROUPED_PAGINATED',
      groups: ['10', '20', '50'],
      buildPath: (group: string, start: number, limit: number): string =>
        `tindakan/kdTkp/${group}/${start}/${limit}`,
    },
  },
  DIAGNOSA: {
    catalog: 'DIAGNOSA',
    codeField: 'kdDiag',
    displayField: 'nmDiag',
    fetchPlan: {
      kind: 'KEYWORD',
      buildPath: (keyword: string, start: number, limit: number): string =>
        `diagnosa/${encodeURIComponent(keyword)}/${start}/${limit}`,
    },
  },
  DPHO: {
    catalog: 'DPHO',
    codeField: 'kdObat',
    displayField: 'nmObat',
    fetchPlan: {
      kind: 'KEYWORD',
      buildPath: (keyword: string, start: number, limit: number): string =>
        `obat/dpho/${encodeURIComponent(keyword)}/${start}/${limit}`,
    },
  },
  SPESIALIS: {
    catalog: 'SPESIALIS',
    codeField: 'kdSpesialis',
    displayField: 'nmSpesialis',
    fetchPlan: { kind: 'SINGLE', path: 'spesialis' },
  },
  SARANA: {
    catalog: 'SARANA',
    codeField: 'kdSarana',
    displayField: 'nmSarana',
    fetchPlan: { kind: 'SINGLE', path: 'spesialis/sarana' },
  },
};
