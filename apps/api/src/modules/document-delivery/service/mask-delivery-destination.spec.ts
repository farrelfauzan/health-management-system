import {
  maskDeliveryDestination,
  maskEmailAddress,
  maskPhoneNumber,
} from './mask-delivery-destination';

describe('maskDeliveryDestination', () => {
  it('keeps the country prefix and the last four digits of a number', () => {
    expect(maskPhoneNumber('628129990024')).toBe('6281****0024');
  });

  it('ignores formatting characters before masking', () => {
    expect(maskPhoneNumber('+62 812-9990-024')).toBe('6281****0024');
  });

  it('shows only a short prefix when the number is too short to keep both ends', () => {
    expect(maskPhoneNumber('12345678')).toBe('12****');
  });

  it('keeps the first character and the domain of an email', () => {
    expect(maskEmailAddress('rina@example.test')).toBe('r***@example.test');
  });

  it('never reveals more than one character of a malformed address', () => {
    expect(maskEmailAddress('rina')).toBe('r***');
  });

  it('dispatches on the destination channel', () => {
    expect(
      maskDeliveryDestination({
        channel: 'WHATSAPP',
        externalChatId: '628129990024@s.whatsapp.net',
        phoneNumber: '628129990024',
      }),
    ).toBe('6281****0024');
    expect(maskDeliveryDestination({ channel: 'EMAIL', email: 'rina@example.test' })).toBe(
      'r***@example.test',
    );
  });
});
