import { formatPatientAddress } from '@hms/shared-types';

describe('formatPatientAddress', () => {
  it('prints street, RT/RW, village, district, regency, province and postal code in that order', () => {
    const actual = formatPatientAddress({
      address: 'Jl. Merdeka No. 10',
      rtRw: '001/002',
      villageName: 'Gambir',
      districtName: 'Gambir',
      regencyName: 'Kota Administrasi Jakarta Pusat',
      provinceName: 'Daerah Khusus Ibukota Jakarta',
      postalCode: '10110',
    });

    expect(actual).toBe(
      'Jl. Merdeka No. 10, RT/RW 001/002, Gambir, Gambir, Kota Administrasi Jakarta Pusat, Daerah Khusus Ibukota Jakarta, 10110',
    );
  });

  it('degrades to the street line alone for a row that predates the master data', () => {
    const actual = formatPatientAddress({
      address: 'Jl. Braga No. 5',
      rtRw: null,
      villageName: null,
      districtName: null,
      regencyName: null,
      provinceName: null,
      postalCode: null,
    });

    expect(actual).toBe('Jl. Braga No. 5');
  });

  it('leaves out whatever is blank rather than printing empty commas', () => {
    const actual = formatPatientAddress({
      address: '  ',
      rtRw: '003/007',
      villageName: 'Sukarasa',
      districtName: '',
      regencyName: 'Kota Bandung',
      provinceName: undefined,
      postalCode: '40111',
    });

    expect(actual).toBe('RT/RW 003/007, Sukarasa, Kota Bandung, 40111');
  });

  it('prints an empty string for a draft with no address at all', () => {
    expect(formatPatientAddress({})).toBe('');
  });
});
