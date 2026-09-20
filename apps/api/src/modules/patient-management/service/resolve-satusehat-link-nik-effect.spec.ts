import { resolveSatusehatLinkNikEffect } from '@hms/shared-types';

describe('resolveSatusehatLinkNikEffect', () => {
  const linkedNewborn = {
    hasSatusehatLink: true,
    motherPatientId: 'mother-1',
    currentNikIndex: null,
  };

  it('keeps the link when a newborn receives her first NIK', () => {
    const actual = resolveSatusehatLinkNikEffect({ ...linkedNewborn, nextNikIndex: 'index-new' });

    expect(actual).toBe('NEWBORN_NIK_ADDED');
  });

  it('clears the link when a newborn who already has a NIK gets a different one', () => {
    const actual = resolveSatusehatLinkNikEffect({
      ...linkedNewborn,
      currentNikIndex: 'index-old',
      nextNikIndex: 'index-new',
    });

    expect(actual).toBe('CLEARED');
  });

  it('clears the link when a patient who is not a newborn gains a first NIK', () => {
    const actual = resolveSatusehatLinkNikEffect({
      ...linkedNewborn,
      motherPatientId: null,
      nextNikIndex: 'index-new',
    });

    expect(actual).toBe('CLEARED');
  });

  it('clears the link when a newborn has her NIK cleared to null', () => {
    const actual = resolveSatusehatLinkNikEffect({
      ...linkedNewborn,
      currentNikIndex: 'index-old',
      nextNikIndex: null,
    });

    expect(actual).toBe('CLEARED');
  });

  it('leaves the link alone when the NIK is written back unchanged', () => {
    const actual = resolveSatusehatLinkNikEffect({
      ...linkedNewborn,
      currentNikIndex: 'index-same',
      nextNikIndex: 'index-same',
    });

    expect(actual).toBe('UNCHANGED');
  });

  it('has nothing to do when the patient holds no SATUSEHAT link', () => {
    const actual = resolveSatusehatLinkNikEffect({
      ...linkedNewborn,
      hasSatusehatLink: false,
      nextNikIndex: 'index-new',
    });

    expect(actual).toBe('UNCHANGED');
  });
});
