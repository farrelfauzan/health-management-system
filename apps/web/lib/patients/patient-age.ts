export function computePatientAge(dateOfBirth: string, referenceDate: Date = new Date()): number {
  const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);

  if (Number.isNaN(birthDate.getTime())) {
    return 0;
  }

  let age = referenceDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasBirthdayPassed =
    referenceDate.getUTCMonth() > birthDate.getUTCMonth() ||
    (referenceDate.getUTCMonth() === birthDate.getUTCMonth() &&
      referenceDate.getUTCDate() >= birthDate.getUTCDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return Math.max(0, age);
}
