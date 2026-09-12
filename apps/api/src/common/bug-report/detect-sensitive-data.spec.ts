import { detectSensitiveData, SensitiveDataCategory } from '@hms/shared-types';

/**
 * `P23-T07`. The detection rules live in `@hms/shared-types` so the report
 * dialog and the intake API block exactly the same text — and
 * `packages/shared-types` has no test runner of its own, so its unit tests sit
 * here, next to the app that has one, exactly as `common/phone-number` does for
 * the phone rule.
 */

/**
 * The MRN format used throughout: a prefixed, eight-digit number, which is what
 * `PATIENT_MRN_PREFIX=RM` with the default `PATIENT_MRN_WIDTH` produces. Only
 * the API passes a format, so every case that omits it is also asserting what
 * the browser sees.
 */
const MRN_FORMAT = { prefix: 'RM', width: 8 } as const;

type MatchCase = {
  readonly name: string;
  readonly text: string;
  readonly expectedCategories: readonly SensitiveDataCategory[];
};

const MATCH_CASES: readonly MatchCase[] = [
  {
    name: 'a NIK written with spaces',
    text: 'pasien NIK 3171 0123 4567 8901 gagal disimpan',
    expectedCategories: ['NIK'],
  },
  {
    name: 'a NIK written with dots',
    text: 'NIK 3171.0123.4567.8901 tidak tersimpan',
    expectedCategories: ['NIK'],
  },
  { name: 'a bare NIK', text: 'nik 3171012345678901 error', expectedCategories: ['NIK'] },
  {
    name: 'a BPJS number',
    text: 'kartu BPJS 0001234567890 ditolak',
    expectedCategories: ['BPJS_NUMBER'],
  },
  {
    name: 'an international phone number with separators',
    text: 'hubungi +62 812-3456-7890 untuk konfirmasi',
    expectedCategories: ['PHONE'],
  },
  {
    name: 'an international phone number without a separator',
    text: 'nomor +6281234567890 gagal dihubungi',
    expectedCategories: ['PHONE'],
  },
  {
    name: 'a country code written without a plus',
    text: 'wa 62812 1000 0001 aktif',
    expectedCategories: ['PHONE'],
  },
  {
    name: 'a national phone number with dashes',
    text: 'telepon 0812-3456-7890 mati',
    expectedCategories: ['PHONE'],
  },
  {
    name: 'a national phone number',
    text: 'nomor 081234567890 tidak bisa dihubungi',
    expectedCategories: ['PHONE'],
  },
  {
    name: 'an email address',
    text: 'undangan ke budi.santoso@klinik.co.id gagal terkirim',
    expectedCategories: ['EMAIL'],
  },
  {
    name: 'a JWT',
    text: 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk gagal',
    expectedCategories: ['SECRET'],
  },
  {
    name: 'a bearer token',
    text: 'header Bearer abcdefghijklmnop1234567890 ditolak',
    expectedCategories: ['SECRET'],
  },
  {
    name: 'a vendor API key',
    text: 'kunci sk-abcdefghijklmnopqrstuvwx tidak valid',
    expectedCategories: ['SECRET'],
  },
  {
    name: 'a password assignment',
    text: 'saya login dengan password: hunter2 lalu gagal',
    expectedCategories: ['SECRET'],
  },
  {
    name: 'an Indonesian password assignment',
    text: 'kata sandi: rahasiaku tidak diterima',
    expectedCategories: ['SECRET'],
  },
];

type NonMatchCase = {
  readonly name: string;
  readonly text: string;
};

const NON_MATCH_CASES: readonly NonMatchCase[] = [
  {
    name: 'a request-ID UUID',
    text: 'request 3f1a9c7e-2b4d-4f8a-9c1e-7d5b8a2f6e04 mengembalikan 500',
  },
  { name: 'an ISO date', text: 'terjadi pada 2026-09-11 saat menyimpan' },
  { name: 'an ISO timestamp', text: 'log 2026-09-11T10:30:00Z menunjukkan error' },
  { name: 'a clock time', text: 'sekitar jam 10:30 halaman gagal dimuat' },
  { name: 'a version string', text: 'aplikasi versi v1.2.3 di tablet resepsionis' },
  { name: 'a twelve-digit number', text: 'kode antrean 123456789012 tidak muncul' },
  { name: 'an invoice number', text: 'faktur INV/20260729/0001 tidak bisa dicetak' },
  { name: 'ordinary prose', text: 'tombol simpan tidak berfungsi di halaman pasien' },
];

describe('detectSensitiveData', () => {
  describe.each(MATCH_CASES)('matches $name', ({ text, expectedCategories }) => {
    it('reports exactly the expected categories', () => {
      const actualFindings = detectSensitiveData(text, { mrnFormat: MRN_FORMAT });

      expect(actualFindings.map((finding) => finding.category)).toEqual(expectedCategories);
    });

    it('reports offsets that select a non-empty span inside the text', () => {
      const actualFindings = detectSensitiveData(text, { mrnFormat: MRN_FORMAT });

      for (const finding of actualFindings) {
        expect(finding.start).toBeGreaterThanOrEqual(0);
        expect(finding.end).toBeGreaterThan(finding.start);
        expect(finding.end).toBeLessThanOrEqual(text.length);
      }
    });
  });

  describe.each(NON_MATCH_CASES)('does not match $name', ({ text }) => {
    it('reports no finding', () => {
      const actualFindings = detectSensitiveData(text, { mrnFormat: MRN_FORMAT });

      expect(actualFindings).toEqual([]);
    });
  });

  it('covers the whole NIK with one finding when it is written with spaces', () => {
    const inputText = 'pasien NIK 3171 0123 4567 8901 gagal disimpan';
    const expectedNik = '3171 0123 4567 8901';

    const actualFindings = detectSensitiveData(inputText);

    expect(actualFindings).toHaveLength(1);
    const [actualFinding] = actualFindings;
    expect(actualFinding?.category).toBe('NIK');
    expect(inputText.slice(actualFinding?.start, actualFinding?.end)).toBe(expectedNik);
  });

  it('never returns the matched value itself', () => {
    const inputText = 'NIK 3171012345678901 dan email a@b.co';

    const actualFindings = detectSensitiveData(inputText);

    for (const finding of actualFindings) {
      expect(Object.keys(finding).sort()).toEqual(['category', 'end', 'start']);
    }
  });

  describe('MRN', () => {
    it('matches an MRN when the caller knows the deployment format', () => {
      const actualFindings = detectSensitiveData('rekam medis RM00001234 kosong', {
        mrnFormat: MRN_FORMAT,
      });

      expect(actualFindings.map((finding) => finding.category)).toEqual(['MRN']);
    });

    it('does not match an MRN when no format is supplied, as in the browser', () => {
      const actualFindings = detectSensitiveData('rekam medis RM00001234 kosong');

      expect(actualFindings).toEqual([]);
    });

    it('ignores a blank prefix rather than flagging every number of that width', () => {
      const actualFindings = detectSensitiveData('kode antrean 00001234 tidak muncul', {
        mrnFormat: { prefix: '   ', width: 8 },
      });

      expect(actualFindings).toEqual([]);
    });
  });

  describe('overlapping findings', () => {
    it('reports the credential once when its value is also a phone number', () => {
      const inputText = 'password: 081234567890';

      const actualFindings = detectSensitiveData(inputText);

      expect(actualFindings).toHaveLength(1);
      const [actualFinding] = actualFindings;
      expect(actualFinding?.category).toBe('SECRET');
      expect(inputText.slice(actualFinding?.start, actualFinding?.end)).toBe(inputText);
    });

    it('keeps separate findings that do not contain one another', () => {
      const actualFindings = detectSensitiveData(
        'NIK 3171012345678901 dan telepon 081234567890',
      );

      expect(actualFindings.map((finding) => finding.category)).toEqual(['NIK', 'PHONE']);
    });

    it('returns findings ordered by where they start', () => {
      const actualFindings = detectSensitiveData(
        'email a@b.co, NIK 3171012345678901, telepon 081234567890',
      );

      const actualStarts = actualFindings.map((finding) => finding.start);
      expect(actualStarts).toEqual([...actualStarts].sort((left, right) => left - right));
    });

    it('does not report the local part of an email as a phone number', () => {
      const actualFindings = detectSensitiveData('kirim ke 081234567890@sms.gateway.id gagal');

      expect(actualFindings.map((finding) => finding.category)).toEqual(['EMAIL']);
    });
  });

  it('returns no finding for empty text', () => {
    expect(detectSensitiveData('')).toEqual([]);
  });
});
