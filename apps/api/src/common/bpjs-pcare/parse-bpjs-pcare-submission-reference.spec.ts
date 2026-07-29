import { parseBpjsPcareSubmissionReference } from './parse-bpjs-pcare-submission-reference';

describe('parseBpjsPcareSubmissionReference', () => {
  it('accepts the envelope variants the reference implementations disagree on', () => {
    expect(parseBpjsPcareSubmissionReference('A12')).toBe('A12');
    expect(parseBpjsPcareSubmissionReference({ message: 'A12' })).toBe('A12');
    expect(parseBpjsPcareSubmissionReference({ noUrut: 'A12' })).toBe('A12');
    expect(parseBpjsPcareSubmissionReference({ noKunjungan: '0001R0010826K000012' })).toBe(
      '0001R0010826K000012',
    );
    expect(parseBpjsPcareSubmissionReference({ noUrut: 12 })).toBe('12');
  });

  it('returns null when no reference is present', () => {
    expect(parseBpjsPcareSubmissionReference(null)).toBeNull();
    expect(parseBpjsPcareSubmissionReference({})).toBeNull();
    expect(parseBpjsPcareSubmissionReference('   ')).toBeNull();
  });
});
