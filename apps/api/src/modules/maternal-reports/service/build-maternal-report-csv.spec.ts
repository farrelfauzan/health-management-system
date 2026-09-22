import { KOHORT_IBU_COLUMNS, KohortRegisterResponse } from '@hms/shared-types';

import { buildKohortRegisterCsv } from './build-kohort-register-csv';
import { buildMaternalReportCsv } from './build-maternal-report-csv';

describe('Maternal report CSV (P25-T15)', () => {
  it('starts with a UTF-8 byte order mark, neutralises formulas and quotes commas', () => {
    const actual = buildMaternalReportCsv([['=SUM(A1)', 'Ny. Siti, S.Pd', 'plain'], []]);

    expect(actual.charCodeAt(0)).toBe(0xfeff);
    expect(actual.slice(1)).toBe(`'=SUM(A1),"Ny. Siti, S.Pd",plain\r\n\r\n`);
  });

  it('puts the configured columns, in order, as the header row of a register', () => {
    const register: KohortRegisterResponse = {
      register: 'kohort-ibu',
      header: {
        clinicName: 'Klinik Bidan Sehati',
        puskesmasName: 'Puskesmas Cibeunying',
        puskesmasCode: 'P3273110201',
        month: '2026-10',
        monthLabel: 'Oktober 2026',
        generatedAt: '2 Nov 2026, 08.15',
      },
      villageCode: null,
      isProvisionalLayout: false,
      columns: [...KOHORT_IBU_COLUMNS],
      villages: [],
      groups: [
        {
          villageCode: 'A',
          villageName: 'Cihaurgeulis',
          rows: [
            {
              id: 'e-1',
              villageCode: 'A',
              villageName: 'Cihaurgeulis',
              values: KOHORT_IBU_COLUMNS.map((column, index) => (index === 0 ? '1' : column.field)),
            },
          ],
        },
      ],
      totalRows: 1,
    };

    const lines = buildKohortRegisterCsv(register).slice(1).split('\r\n');

    expect(lines[0]).toBe('Laporan,Register Kohort Ibu');
    expect(lines[2]).toBe('Puskesmas,Puskesmas Cibeunying');
    expect(lines[6]).toBe('');
    expect(lines[7]).toBe(KOHORT_IBU_COLUMNS.map((column) => column.label).join(','));
    expect(lines[8]?.startsWith('1,motherName,nik,')).toBe(true);
  });
});
