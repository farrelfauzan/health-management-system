import { normalizeChatSessionTitle } from './normalize-chat-session-title';

describe('normalizeChatSessionTitle', () => {
  it('keeps a clean title as it is', () => {
    const actualTitle = normalizeChatSessionTitle('Jam buka klinik');

    expect(actualTitle).toBe('Jam buka klinik');
  });

  it('strips the label and quotes a model wraps its answer in', () => {
    const actualTitle = normalizeChatSessionTitle('Title: "Jadwal praktik dokter umum"');

    expect(actualTitle).toBe('Jadwal praktik dokter umum');
  });

  it('keeps only the first paragraph when the model explains itself', () => {
    const inputContent = 'Stok obat menipis\n\nThis title summarizes the exchange above.';

    const actualTitle = normalizeChatSessionTitle(inputContent);

    expect(actualTitle).toBe('Stok obat menipis');
  });

  it('drops markup rather than storing it in a sidebar row', () => {
    const actualTitle = normalizeChatSessionTitle('<b>Beban pasien</b> hari ini');

    expect(actualTitle).toBe('Beban pasien hari ini');
  });

  it('collapses whitespace so a pasted question becomes one line', () => {
    const actualTitle = normalizeChatSessionTitle('  Jam berapa\n  klinik   buka?  ');

    expect(actualTitle).toBe('Jam berapa klinik buka?');
  });

  it('truncates an over-long title with an ellipsis', () => {
    const inputContent = 'a'.repeat(120);

    const actualTitle = normalizeChatSessionTitle(inputContent);

    expect(actualTitle).toHaveLength(80);
    expect(actualTitle?.endsWith('…')).toBe(true);
  });

  it('returns null when nothing usable survives', () => {
    expect(normalizeChatSessionTitle('   ')).toBeNull();
    expect(normalizeChatSessionTitle('"..."')).toBeNull();
  });
});
