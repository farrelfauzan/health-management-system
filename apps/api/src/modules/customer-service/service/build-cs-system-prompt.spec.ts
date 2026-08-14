import { buildCsSystemPrompt } from './build-cs-system-prompt';

describe('buildCsSystemPrompt', () => {
  const inputClinicName = 'Klinik SalingJaga';
  const inputCurrentDate = '2026-08-14';

  it('names the clinic it is answering for', () => {
    const actualPrompt = buildCsSystemPrompt({
      clinicName: inputClinicName,
      currentDate: inputCurrentDate,
    });
    expect(actualPrompt).toContain(inputClinicName);
  });

  it("states today's date so relative dates are resolvable", () => {
    const actualPrompt = buildCsSystemPrompt({
      clinicName: inputClinicName,
      currentDate: inputCurrentDate,
    });
    expect(actualPrompt).toContain(`Hari ini tanggal ${inputCurrentDate}`);
  });

  it('tells the model to compute relative dates rather than ask for them', () => {
    const actualPrompt = buildCsSystemPrompt({
      clinicName: inputClinicName,
      currentDate: inputCurrentDate,
    });
    expect(actualPrompt).toContain('besok');
    expect(actualPrompt).toContain('YYYY-MM-DD');
  });

  it('keeps the rules that the prompt is not the only thing enforcing', () => {
    const actualPrompt = buildCsSystemPrompt({
      clinicName: inputClinicName,
      currentDate: inputCurrentDate,
    });
    expect(actualPrompt).toContain('NIK');
    expect(actualPrompt).toContain('diagnosis');
  });
});
