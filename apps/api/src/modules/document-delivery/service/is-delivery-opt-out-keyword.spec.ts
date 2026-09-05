import { isDeliveryOptOutKeyword } from '@hms/shared-types';

describe('isDeliveryOptOutKeyword', () => {
  it.each(['BERHENTI', 'STOP', 'berhenti', 'stop', 'Berhenti', '  STOP  ', 'BERHENTI!', 'stop.'])(
    'recognises %p as an opt-out',
    (inputText) => {
      expect(isDeliveryOptOutKeyword(inputText)).toBe(true);
    },
  );

  it.each([
    'tolong jangan berhenti kirim kuitansinya',
    'stop kirim ke email saja',
    'Klinik buka jam berapa?',
    'BERHENTI DULU',
    '',
    '   ',
  ])('leaves %p alone', (inputText) => {
    // A keyword inside a sentence is a sentence, and "jangan berhenti" is
    // the opposite request. Only the whole message counts.
    expect(isDeliveryOptOutKeyword(inputText)).toBe(false);
  });
});
