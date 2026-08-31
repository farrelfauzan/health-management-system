import { scoreNameSimilarity } from './score-name-similarity';

describe('scoreNameSimilarity', () => {
  it('scores an identical name as a full match', () => {
    const actual = scoreNameSimilarity('Siti Rahmawati', 'Siti Rahmawati');

    expect(actual).toBe(1);
  });

  it('ignores case and punctuation', () => {
    const actual = scoreNameSimilarity('M.Yusuf Hakim', 'm yusuf hakim');

    expect(actual).toBe(1);
  });

  it('treats a registry record carrying more name as a full match', () => {
    // The chatbot was told two names and the registry holds four. This is the
    // ordinary case at a counter, not evidence of a different person.
    const actual = scoreNameSimilarity('Siti Rahmawati', 'Siti Nur Rahmawati Putri');

    expect(actual).toBe(1);
  });

  it('matches regardless of the order the names were given in', () => {
    const actual = scoreNameSimilarity('Rahmawati Siti', 'Siti Rahmawati');

    expect(actual).toBe(1);
  });

  it('accepts an abbreviated first name of at least four characters', () => {
    const actual = scoreNameSimilarity('Muham Yusuf', 'Muhammad Yusuf');

    expect(actual).toBe(1);
  });

  it('refuses a short prefix as a match', () => {
    // "Sri" is a whole name, not an abbreviation of "Srikandi", and treating
    // it as one would collapse two people into one candidate row.
    const actual = scoreNameSimilarity('Sri', 'Srikandi');

    expect(actual).toBe(0);
  });

  it('ignores lineage particles and titles', () => {
    const actual = scoreNameSimilarity('Ahmad bin Abdullah', 'Ahmad Abdullah');

    expect(actual).toBe(1);
  });

  it('does not let a shared particle alone produce a match', () => {
    const actual = scoreNameSimilarity('Ahmad bin Salim', 'Yusuf bin Hakim');

    expect(actual).toBe(0);
  });

  it('scores a partial overlap between the extremes', () => {
    const actual = scoreNameSimilarity('Siti Aminah', 'Siti Rahmawati');

    expect(actual).toBe(0.5);
  });

  it('scores unrelated names as no match', () => {
    const actual = scoreNameSimilarity('Budi Santoso', 'Siti Rahmawati');

    expect(actual).toBe(0);
  });

  it('returns zero when a side has no identifying token', () => {
    const actual = scoreNameSimilarity('bin', 'Siti Rahmawati');

    expect(actual).toBe(0);
  });
});
