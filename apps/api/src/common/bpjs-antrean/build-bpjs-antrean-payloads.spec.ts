import { buildBpjsAntreanAddPayload } from './build-bpjs-antrean-add-payload';
import { buildBpjsAntreanBatalPayload } from './build-bpjs-antrean-batal-payload';
import { buildBpjsAntreanPanggilPayload } from './build-bpjs-antrean-panggil-payload';
import { formatBpjsAntreanDate } from './format-bpjs-antrean-date';

/**
 * These pin HMS's *reading* of the Antrean outbound protocol (P14-T05), not
 * the protocol. Every field name is spike question Q2 and unconfirmed against
 * a live BPJS environment — a green suite here proves the builders are
 * internally consistent and says nothing about what BPJS accepts.
 */
describe('formatBpjsAntreanDate', () => {
  it('emits yyyy-MM-dd, not PCare’s dd-MM-yyyy', () => {
    // The two BPJS services disagree on date format. Reusing the PCare
    // formatter would transpose every tanggalperiksa — a bug that reads as
    // correct in review and surfaces only at UAT.
    expect(formatBpjsAntreanDate(new Date('2026-08-05T00:00:00.000Z'))).toBe('2026-08-05');
  });

  it('reads the UTC parts, matching the queueDate convention', () => {
    // Clinic-local calendar days are stored as UTC-midnight dates, so the UTC
    // parts are the clinic-local day regardless of server timezone.
    expect(formatBpjsAntreanDate(new Date('2026-01-09T00:00:00.000Z'))).toBe('2026-01-09');
  });
});

describe('buildBpjsAntreanAddPayload', () => {
  const inputOptions = {
    bookingCode: '001-20260805-ABCDEF0123',
    cardNumber: '0001234567890',
    nationalIdentityNumber: '3201011234567890',
    phoneNumber: '081200000000',
    poliCode: '001',
    poliName: 'Umum',
    medicalRecordNumber: '00000042',
    examinationDate: new Date('2026-08-05T00:00:00.000Z'),
    doctorCode: 'D01',
    doctorName: 'dr. Andi',
    practiceWindow: '08:00-12:00',
    queueNumber: 12,
    estimatedServiceTime: 1_775_000_000_000,
  };

  it('builds the documented FKTP field set', () => {
    const actual = buildBpjsAntreanAddPayload(inputOptions);

    expect(actual).toEqual({
      kodebooking: '001-20260805-ABCDEF0123',
      jenispasien: 'JKN',
      nomorkartu: '0001234567890',
      nik: '3201011234567890',
      nohp: '081200000000',
      kodepoli: '001',
      namapoli: 'Umum',
      norm: '00000042',
      tanggalperiksa: '2026-08-05',
      kodedokter: 'D01',
      namadokter: 'dr. Andi',
      jampraktek: '08:00-12:00',
      nomorantrean: '001-12',
      angkaantrean: 12,
      estimasidilayani: 1_775_000_000_000,
      keterangan: expect.any(String),
    });
  });

  it('carries the display number and the bare number as separate fields', () => {
    // BPJS renders `nomorantrean` to the member and reads `angkaantrean` for
    // ordering; collapsing them would break one of the two consumers.
    const actual = buildBpjsAntreanAddPayload({ ...inputOptions, queueNumber: 7 });

    expect(actual.nomorantrean).toBe('001-7');
    expect(actual.angkaantrean).toBe(7);
  });
});

describe('buildBpjsAntreanPanggilPayload', () => {
  it('reports the observed service start as epoch milliseconds', () => {
    const inputOccurredAt = new Date('2026-08-05T02:30:00.000Z');

    const actual = buildBpjsAntreanPanggilPayload({
      examinationDate: new Date('2026-08-05T00:00:00.000Z'),
      poliCode: '001',
      cardNumber: '0001234567890',
      occurredAt: inputOccurredAt,
    });

    expect(actual).toEqual({
      tanggalperiksa: '2026-08-05',
      kodepoli: '001',
      nomorkartu: '0001234567890',
      // 3 = "sedang dilayani". HMS records no "patient called" event (§3.5),
      // so it publishes the one status it genuinely observes rather than
      // inventing a called-time from the check-in.
      status: 3,
      waktu: inputOccurredAt.getTime(),
    });
  });
});

describe('buildBpjsAntreanBatalPayload', () => {
  const inputBase = {
    examinationDate: new Date('2026-08-05T00:00:00.000Z'),
    poliCode: '001',
    cardNumber: '0001234567890',
  };

  it('always sends a reason', () => {
    // BPJS shows this to the member whose queue number just vanished from
    // their phone, so an empty string is the worst possible answer.
    const actual = buildBpjsAntreanBatalPayload({ ...inputBase, reason: null });

    expect(actual.alasan.length).toBeGreaterThan(0);
  });

  it('prefers a recorded cancellation note over the default', () => {
    const actual = buildBpjsAntreanBatalPayload({
      ...inputBase,
      reason: 'Peserta tidak hadir',
    });

    expect(actual.alasan).toBe('Peserta tidak hadir');
  });

  it('falls back when the recorded note is blank', () => {
    const actual = buildBpjsAntreanBatalPayload({ ...inputBase, reason: '   ' });

    expect(actual.alasan).not.toBe('');
    expect(actual.alasan).not.toBe('   ');
  });

  it('addresses the entry by date, poli and card number', () => {
    const actual = buildBpjsAntreanBatalPayload({ ...inputBase, reason: 'batal' });

    expect(actual.tanggalperiksa).toBe('2026-08-05');
    expect(actual.kodepoli).toBe('001');
    expect(actual.nomorkartu).toBe('0001234567890');
  });
});
