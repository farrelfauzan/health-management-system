import {
  decodeChannelSessionReference,
  encodeChannelSessionReference,
} from './channel-session-reference';

describe('channel session references', () => {
  const inputReference = {
    doctorId: '22222222-2222-4222-8222-222222222222',
    scheduleId: '11111111-1111-4111-8111-111111111111',
    sessionDate: '2026-08-20',
  };

  it('round-trips a token it minted', () => {
    const token = encodeChannelSessionReference(inputReference);

    expect(decodeChannelSessionReference(token)).toEqual({
      scheduleId: inputReference.scheduleId,
      sessionDate: inputReference.sessionDate,
    });
  });

  it('does not carry the doctor, so a token cannot pair one window with another doctor', () => {
    const token = encodeChannelSessionReference(inputReference);

    expect(token).not.toContain(inputReference.doctorId);
  });

  it.each([
    ['a plain sentence', 'sesi besok pagi'],
    ['a missing date', '11111111-1111-4111-8111-111111111111'],
    ['a non-ISO date', '11111111-1111-4111-8111-111111111111@besok'],
    ['a non-UUID schedule', 'schedule-1@2026-08-20'],
    ['an extra separator', '11111111-1111-4111-8111-111111111111@2026-08-20@extra'],
  ])('refuses %s rather than guessing', (_label, token) => {
    // A constructed booking target is a booking the customer never chose, so
    // an unparseable token is a refusal and never a best effort.
    expect(decodeChannelSessionReference(token)).toBeNull();
  });
});
