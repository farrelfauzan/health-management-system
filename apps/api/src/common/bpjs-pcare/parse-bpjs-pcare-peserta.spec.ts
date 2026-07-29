import { BpjsPcareError } from './bpjs-pcare.error';
import { parseBpjsPcarePeserta } from './parse-bpjs-pcare-peserta';

describe('parseBpjsPcarePeserta', () => {
  const inputActiveMember = {
    noKartu: '0001234567890',
    nama: 'BUDI SANTOSO',
    aktif: true,
    ketAktif: 'AKTIF',
    jnsPeserta: { kode: '11', nama: 'PEKERJA PENERIMA UPAH' },
    jnsKelas: { kode: '1', nama: 'KELAS I' },
    kdProviderPst: { kdProvider: '01000101', nmProvider: 'KLINIK DEMO' },
    pstProl: '0',
    pstPrb: '1',
  };

  it('parses a bare member object into the card summary', () => {
    const actualSummary = parseBpjsPcarePeserta(inputActiveMember);

    expect(actualSummary).toEqual({
      name: 'BUDI SANTOSO',
      isActive: true,
      statusReason: 'AKTIF',
      memberTypeName: 'PEKERJA PENERIMA UPAH',
      memberClassName: 'KELAS I',
      providerCode: '01000101',
      providerName: 'KLINIK DEMO',
      isProlanis: false,
      isPrb: true,
    });
  });

  it('unwraps the peserta and list envelope variants', () => {
    const actualFromPeserta = parseBpjsPcarePeserta({ peserta: inputActiveMember });
    const actualFromList = parseBpjsPcarePeserta({ list: [inputActiveMember] });

    expect(actualFromPeserta?.name).toBe('BUDI SANTOSO');
    expect(actualFromList?.name).toBe('BUDI SANTOSO');
  });

  it('reads a string aktif flag and falls back to ketAktif when aktif is absent', () => {
    const actualFromString = parseBpjsPcarePeserta({ ...inputActiveMember, aktif: 'false' });
    const actualFromKetAktif = parseBpjsPcarePeserta({
      nama: 'BUDI SANTOSO',
      ketAktif: 'PENANGGUHAN PEMBAYARAN',
    });

    expect(actualFromString?.isActive).toBe(false);
    expect(actualFromKetAktif?.isActive).toBe(false);
    expect(actualFromKetAktif?.statusReason).toBe('PENANGGUHAN PEMBAYARAN');
  });

  it('returns null for a null response and an empty list', () => {
    expect(parseBpjsPcarePeserta(null)).toBeNull();
    expect(parseBpjsPcarePeserta({ list: [] })).toBeNull();
  });

  it('fails loudly when the member carries no activity signal', () => {
    const runParse = (): unknown => parseBpjsPcarePeserta({ nama: 'BUDI SANTOSO' });

    expect(runParse).toThrow(BpjsPcareError);
    expect(runParse).toThrow(/aktif\/ketAktif/);
  });
});
