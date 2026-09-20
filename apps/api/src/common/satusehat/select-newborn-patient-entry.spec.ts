import { selectNewbornPatientEntry } from './select-newborn-patient-entry';

const criteria = { birthDate: '2026-09-20', multipleBirthInteger: 2 };

describe('selectNewbornPatientEntry', () => {
  it('picks the entry whose birth date and birth order both agree', () => {
    const actualIhsNumber = selectNewbornPatientEntry(
      {
        total: 3,
        entry: [
          { resource: { id: 'sibling-2019', birthDate: '2019-04-01', multipleBirthInteger: 1 } },
          { resource: { id: 'this-baby', birthDate: '2026-09-20', multipleBirthInteger: 2 } },
        ],
      },
      criteria,
    );

    expect(actualIhsNumber).toBe('this-baby');
  });

  it('never takes a twin born the same day under another birth order', () => {
    const actualIhsNumber = selectNewbornPatientEntry(
      { entry: [{ resource: { id: 'her-sister', birthDate: '2026-09-20', multipleBirthInteger: 1 } }] },
      criteria,
    );

    expect(actualIhsNumber).toBeNull();
  });

  it('never takes a sibling with the same birth order born another year', () => {
    const actualIhsNumber = selectNewbornPatientEntry(
      { entry: [{ resource: { id: 'older-child', birthDate: '2019-04-01', multipleBirthInteger: 2 } }] },
      criteria,
    );

    expect(actualIhsNumber).toBeNull();
  });

  it('refuses an entry that cannot be told apart, rather than guessing', () => {
    const actualIhsNumber = selectNewbornPatientEntry(
      { entry: [{ resource: { id: 'unknowable', birthDate: '2026-09-20' } }] },
      criteria,
    );

    expect(actualIhsNumber).toBeNull();
  });

  it('returns null for a mother whose children are not on the index yet', () => {
    expect(selectNewbornPatientEntry({ total: 0, entry: [] }, criteria)).toBeNull();
    expect(selectNewbornPatientEntry({}, criteria)).toBeNull();
  });

  it('skips an entry with no usable resource id', () => {
    const actualIhsNumber = selectNewbornPatientEntry(
      {
        entry: [
          { resource: { id: '', birthDate: '2026-09-20', multipleBirthInteger: 2 } },
          { resource: { id: 'this-baby', birthDate: '2026-09-20', multipleBirthInteger: 2 } },
        ],
      },
      criteria,
    );

    expect(actualIhsNumber).toBe('this-baby');
  });
});
