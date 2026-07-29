import { BpjsPcareError } from './bpjs-pcare.error';
import { parseBpjsPcareReferenceList } from './parse-bpjs-pcare-reference-list';

describe('parseBpjsPcareReferenceList', () => {
  it('parses a count/list envelope into code and display entries', () => {
    const inputResponse = {
      count: 2,
      list: [
        { kdPoli: '001', nmPoli: 'POLI UMUM' },
        { kdPoli: '002', nmPoli: 'POLI GIGI' },
      ],
    };

    const actualPage = parseBpjsPcareReferenceList({
      response: inputResponse,
      codeField: 'kdPoli',
      displayField: 'nmPoli',
    });

    expect(actualPage.totalCount).toBe(2);
    expect(actualPage.entries).toEqual([
      { code: '001', display: 'POLI UMUM' },
      { code: '002', display: 'POLI GIGI' },
    ]);
  });

  it('parses a bare array payload and coerces numeric field values', () => {
    const inputResponse = [{ kdSadar: 1, nmSadar: 'Compos Mentis' }];

    const actualPage = parseBpjsPcareReferenceList({
      response: inputResponse,
      codeField: 'kdSadar',
      displayField: 'nmSadar',
    });

    expect(actualPage.entries).toEqual([{ code: '1', display: 'Compos Mentis' }]);
    expect(actualPage.totalCount).toBe(1);
  });

  it('parses a string count and trims whitespace-padded field values', () => {
    const inputResponse = {
      count: '87',
      list: [{ kdTindakan: ' 0101 ', nmTindakan: ' Jahit Luka ' }],
    };

    const actualPage = parseBpjsPcareReferenceList({
      response: inputResponse,
      codeField: 'kdTindakan',
      displayField: 'nmTindakan',
    });

    expect(actualPage.totalCount).toBe(87);
    expect(actualPage.entries).toEqual([{ code: '0101', display: 'Jahit Luka' }]);
  });

  it('treats a null response as an empty page', () => {
    const actualPage = parseBpjsPcareReferenceList({
      response: null,
      codeField: 'kdPoli',
      displayField: 'nmPoli',
    });

    expect(actualPage.entries).toEqual([]);
    expect(actualPage.totalCount).toBe(0);
  });

  it('attaches the group code to every entry when provided', () => {
    const inputResponse = { list: [{ kdTindakan: '0101', nmTindakan: 'Jahit Luka' }] };

    const actualPage = parseBpjsPcareReferenceList({
      response: inputResponse,
      codeField: 'kdTindakan',
      displayField: 'nmTindakan',
      groupCode: '10',
    });

    expect(actualPage.entries).toEqual([
      { code: '0101', display: 'Jahit Luka', groupCode: '10' },
    ]);
  });

  it('fails loudly as RESPONSE_MALFORMED when the payload carries no list', () => {
    const runParse = (): unknown =>
      parseBpjsPcareReferenceList({
        response: { unexpected: true },
        codeField: 'kdPoli',
        displayField: 'nmPoli',
      });

    expect(runParse).toThrow(BpjsPcareError);
    expect(runParse).toThrow(/no list of entries/);
  });

  it('fails loudly as RESPONSE_MALFORMED when an entry is missing its code field', () => {
    const inputResponse = { list: [{ nmPoli: 'POLI UMUM' }] };

    const runParse = (): unknown =>
      parseBpjsPcareReferenceList({
        response: inputResponse,
        codeField: 'kdPoli',
        displayField: 'nmPoli',
      });

    expect(runParse).toThrow(BpjsPcareError);
    expect(runParse).toThrow(/kdPoli\/nmPoli/);
  });
});
