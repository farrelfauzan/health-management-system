import type {
  MaternalVisitDueSourceValue,
  MaternalVisitDueSubjectValue,
} from '#maternal-visit-due/schemas';

/**
 * What each kind of visit is called in the message. Deliberately coarse:
 * "kunjungan kontrol" rather than naming KB, and "kunjungan bayi" rather than
 * naming the SHK test — a message on a shared family phone must not say what
 * the visit is for beyond what the patient would say out loud (P25-T17).
 */
function resolveVisitLabel(params: {
  source: MaternalVisitDueSourceValue;
  subject: MaternalVisitDueSubjectValue;
}): string {
  if (params.subject === 'NEWBORN') {
    return 'kunjungan bayi';
  }
  if (params.source === 'ANTENATAL') {
    return 'kunjungan kehamilan';
  }
  return params.source === 'POSTNATAL' ? 'kunjungan nifas' : 'kunjungan kontrol';
}

/**
 * The WhatsApp reminder for a patient's due visits (P25-T17): short,
 * Indonesian, and with no diagnosis, result or clinical detail — only that a
 * visit is due this week, at which clinic, and how to stop the messages.
 * Several visits due the same week (KF2 and the baby's KN2 fall together)
 * become one message, not one per visit.
 */
export function buildVisitReminderMessage(params: {
  clinicName: string;
  visits: readonly {
    source: MaternalVisitDueSourceValue;
    subject: MaternalVisitDueSubjectValue;
  }[];
}): string {
  const labels = [...new Set(params.visits.map(resolveVisitLabel))];
  return [
    `Halo Ibu, ini pengingat dari ${params.clinicName}: jadwal ${labels.join(' dan ')} Ibu jatuh tempo minggu ini.`,
    'Silakan datang atau hubungi klinik untuk mengatur waktunya.',
    'Balas BERHENTI jika tidak ingin menerima pengingat lagi.',
  ].join('\n');
}
