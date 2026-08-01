import {
  redactCapturedHeaders,
  redactCapturedPayload,
  truncateCapturedBody,
} from './redact-bpjs-protocol-capture';

/**
 * Redaction is the part of the UAT capture instrument that must not be wrong
 * (P14-T06). A fixture is committed to the repository and read by whoever
 * debugs the integration next; the spike's §3 rule is no card numbers, no
 * NIK, no member names, no credentials or derived keys.
 */
describe('redactCapturedHeaders', () => {
  it('removes the credential and signature headers', () => {
    const actual = redactCapturedHeaders({
      'X-cons-id': '20250042',
      'X-Signature': 'GVwqk0Q0dV+abc=',
      user_key: 'super-secret-user-key',
      'X-Authorization': 'Basic abc123',
    });

    expect(Object.values(actual).every((value) => value === '[redacted]')).toBe(true);
  });

  it('keeps X-Timestamp, because a fixture without it cannot be decoded again', () => {
    // The response AES key derives from the request timestamp (ADR D-022).
    // Redacting it would turn every captured response into an opaque blob.
    const actual = redactCapturedHeaders({ 'X-Timestamp': '1775000000' });

    expect(actual['X-Timestamp']).toBe('1775000000');
  });

  it('matches credential headers case-insensitively', () => {
    // BPJS's own documentation is inconsistent about casing, and a
    // case-sensitive list would leak exactly what this exists to protect.
    const actual = redactCapturedHeaders({ 'USER_KEY': 'secret', 'x-signature': 'sig' });

    expect(actual['USER_KEY']).toBe('[redacted]');
    expect(actual['x-signature']).toBe('[redacted]');
  });

  it('captures the inbound token header as redacted', () => {
    const actual = redactCapturedHeaders({ 'x-token': 'an-issued-token' });

    expect(actual['x-token']).toBe('[redacted]');
  });
});

describe('redactCapturedPayload', () => {
  it('replaces a NIK with a structurally valid synthetic one', () => {
    // Structure survives because shape is most of what a fixture is for; a
    // missing field would test a different payload than BPJS actually saw.
    const actual = redactCapturedPayload({ nik: '3201011234567890' }) as { nik: string };

    expect(actual.nik).toHaveLength(16);
    expect(actual.nik).toMatch(/^\d{16}$/);
    expect(actual.nik).not.toBe('3201011234567890');
  });

  it('replaces a card number with a structurally valid synthetic one', () => {
    const actual = redactCapturedPayload({ nomorkartu: '0001234567890' }) as {
      nomorkartu: string;
    };

    expect(actual.nomorkartu).toHaveLength(13);
    expect(actual.nomorkartu).toMatch(/^\d{13}$/);
    expect(actual.nomorkartu).not.toBe('0001234567890');
  });

  it('replaces member names and phone numbers', () => {
    const actual = redactCapturedPayload({
      nama: 'Budi Santoso',
      nohp: '081298765432',
    }) as Record<string, string>;

    expect(actual.nama).not.toContain('Budi');
    expect(actual.nohp).not.toBe('081298765432');
  });

  it('maps one member to one synthetic value across calls', () => {
    // Deterministic on purpose: a reviewer can follow a participant through a
    // booking, a call and a cancellation without the file ever naming them.
    const first = redactCapturedPayload({ nik: '3201011234567890' }) as { nik: string };
    const second = redactCapturedPayload({ nik: '3201011234567890' }) as { nik: string };
    const other = redactCapturedPayload({ nik: '3201019999999999' }) as { nik: string };

    expect(first.nik).toBe(second.nik);
    expect(first.nik).not.toBe(other.nik);
  });

  it('redacts identifiers nested in lists and objects', () => {
    const actual = redactCapturedPayload({
      response: { list: [{ nomorkartu: '0001234567890', kodepoli: '001' }] },
    }) as { response: { list: Array<{ nomorkartu: string; kodepoli: string }> } };

    expect(actual.response.list[0]?.nomorkartu).not.toBe('0001234567890');
    // Protocol fields are the evidence and are kept verbatim.
    expect(actual.response.list[0]?.kodepoli).toBe('001');
  });

  it('leaves protocol fields untouched', () => {
    const inputPayload = {
      metaData: { code: 200, message: 'Ok' },
      response: { kodebooking: '001-20260805-ABCDEF0123', angkaantrean: 12 },
    };

    expect(redactCapturedPayload(inputPayload)).toEqual(inputPayload);
  });

  it('passes primitives and nulls through', () => {
    expect(redactCapturedPayload(null)).toBeNull();
    expect(redactCapturedPayload('plain')).toBe('plain');
    expect(redactCapturedPayload(7)).toBe(7);
  });
});

describe('truncateCapturedBody', () => {
  it('keeps a normal envelope whole', () => {
    expect(truncateCapturedBody('short-body')).toBe('short-body');
  });

  it('bounds an oversized body', () => {
    // A capture directory filling a disk during UAT would take the facility's
    // endpoint down at the worst possible moment.
    const actual = truncateCapturedBody('x'.repeat(50_000));

    expect(actual.length).toBeLessThan(50_000);
    expect(actual.endsWith('[truncated]')).toBe(true);
  });
});
