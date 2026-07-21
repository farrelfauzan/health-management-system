const SEX_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
};

export function formatPatientSexLabel(sex: string | undefined): string {
  if (!sex) {
    return 'Unspecified';
  }
  return SEX_LABELS[sex] ?? 'Unspecified';
}
