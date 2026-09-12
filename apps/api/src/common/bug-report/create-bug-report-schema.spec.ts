import {
  cleanBugReportPagePath,
  createBugReportSchema,
  createBugReportSchemaWith,
  CreateBugReportInput,
} from '@hms/shared-types';

/**
 * `P23-T08`. The request schema is the enforcement point for the P23-T07 rules:
 * the dialog runs them for convenience, this runs them for real. Its unit tests
 * sit here for the same reason the detector's do — `packages/shared-types` has
 * no test runner of its own.
 */
const VALID_PAYLOAD = {
  title: 'Tombol simpan tidak berfungsi',
  description: 'Saya menekan simpan di halaman pasien dan tidak terjadi apa-apa.',
  pagePath: '/admin/patients',
  requestIds: ['3f1a9c7e-2b4d-4f8a-9c1e-7d5b8a2f6e04'],
  userAgent: 'Mozilla/5.0',
  acknowledgedNoSensitiveData: true as const,
};

function parsePayload(overrides: Record<string, unknown> = {}): ReturnType<
  typeof createBugReportSchema.safeParse
> {
  return createBugReportSchema.safeParse({ ...VALID_PAYLOAD, ...overrides });
}

describe('createBugReportSchema', () => {
  it('accepts a clean report', () => {
    const actualResult = parsePayload();

    expect(actualResult.success).toBe(true);
  });

  it('defaults requestIds so an omitted array is not an undefined column', () => {
    const actualResult = createBugReportSchema.safeParse({
      ...VALID_PAYLOAD,
      requestIds: undefined,
    });

    expect(actualResult.success).toBe(true);
    expect(actualResult.success && actualResult.data.requestIds).toEqual([]);
  });

  describe('refuses sensitive data', () => {
    it.each([
      ['a NIK in the description', 'description', 'NIK pasien 3171012345678901 tidak tersimpan'],
      ['a phone number in the title', 'title', 'Tidak bisa hubungi 0812-3456-7890'],
      ['an email in expected', 'expected', 'seharusnya terkirim ke budi@klinik.co.id'],
      ['a password in actual', 'actual', 'saya coba password: hunter2 lalu gagal'],
      [
        'a BPJS number in the steps',
        'stepsToReproduce',
        'buka kartu BPJS 0001234567890 lalu simpan',
      ],
    ])('rejects %s', (_label, field, value) => {
      const actualResult = parsePayload({ [field]: value });

      expect(actualResult.success).toBe(false);
      const actualIssue = actualResult.success
        ? undefined
        : actualResult.error.issues.find((issue) => issue.path[0] === field);
      expect(actualIssue?.code).toBe('custom');
      const actualParams =
        actualIssue?.code === 'custom' ? actualIssue.params : undefined;
      expect(actualParams?.code).toBe('SENSITIVE_DATA_DETECTED');
    });

    it('names the category without quoting the value it found', () => {
      const inputNik = '3171012345678901';

      const actualResult = parsePayload({ description: `NIK ${inputNik} gagal disimpan` });

      expect(actualResult.success).toBe(false);
      const actualSerialisedError = actualResult.success ? '' : JSON.stringify(actualResult.error);
      expect(actualSerialisedError).toContain('NIK');
      expect(actualSerialisedError).not.toContain(inputNik);
    });

    it('raises one issue per offending field, not one per finding', () => {
      const actualResult = parsePayload({
        description: 'NIK 3171012345678901 dan telepon 0812-3456-7890 dan email a@b.co',
      });

      expect(actualResult.success).toBe(false);
      const actualDescriptionIssues = actualResult.success
        ? []
        : actualResult.error.issues.filter((issue) => issue.path[0] === 'description');
      expect(actualDescriptionIssues).toHaveLength(1);
    });
  });

  describe('the confirmation tick', () => {
    it.each([
      ['omitted', undefined],
      ['false', false],
    ])('refuses a report whose acknowledgement is %s', (_label, value) => {
      const actualResult = createBugReportSchema.safeParse({
        ...VALID_PAYLOAD,
        acknowledgedNoSensitiveData: value,
      });

      expect(actualResult.success).toBe(false);
    });
  });

  describe('technical details', () => {
    it.each([
      ['a query string', '/admin/patients?nik=3171012345678901', '/admin/patients'],
      ['a hash', '/admin/patients#section', '/admin/patients'],
      [
        'a UUID segment',
        '/admin/patients/3f1a9c7e-2b4d-4f8a-9c1e-7d5b8a2f6e04/edit',
        '/admin/patients/:id/edit',
      ],
      ['a long numeric segment', '/admin/invoices/20260729', '/admin/invoices/:id'],
      ['nothing to strip', '/admin/patients', '/admin/patients'],
    ])('cleans %s from the page path', (_label, inputPath, expectedPath) => {
      expect(cleanBugReportPagePath(inputPath)).toBe(expectedPath);
    });

    it('strips the query string during parsing, not only in the helper', () => {
      const actualResult = parsePayload({ pagePath: '/admin/patients?patientId=abc' });

      expect(actualResult.success).toBe(true);
      expect(actualResult.success && actualResult.data.pagePath).toBe('/admin/patients');
    });

    it('refuses a request id that could not have come from this API', () => {
      const actualResult = parsePayload({ requestIds: ['not a request id'] });

      expect(actualResult.success).toBe(false);
    });

    it('refuses more than five request ids', () => {
      const actualResult = parsePayload({
        requestIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      });

      expect(actualResult.success).toBe(false);
    });
  });

  describe('createBugReportSchemaWith', () => {
    it('catches an MRN once the API supplies the deployment format', () => {
      const inputPayload = { ...VALID_PAYLOAD, description: 'rekam medis RM00001234 kosong' };

      const actualResult = createBugReportSchemaWith({
        mrnFormat: { prefix: 'RM', width: 8 },
      }).safeParse(inputPayload);

      expect(actualResult.success).toBe(false);
    });

    it('lets the same text through when no format is known, as in the browser', () => {
      const actualResult = parsePayload({ description: 'rekam medis RM00001234 kosong' });

      expect(actualResult.success).toBe(true);
    });
  });

  it('exposes the parsed payload as the service consumes it', () => {
    const actualResult = parsePayload();
    const actualPayload: CreateBugReportInput | undefined = actualResult.success
      ? actualResult.data
      : undefined;

    expect(actualPayload?.acknowledgedNoSensitiveData).toBe(true);
  });
});
