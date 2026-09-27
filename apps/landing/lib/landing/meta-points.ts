import type { MetaPoint } from '#lib/landing/meta-point';

/** The four reasons under “Lebih dari sekadar RME.” */
export const META_POINTS: readonly MetaPoint[] = [
  {
    icon: 'layers',
    color: '#2448F0',
    title: 'Satu sistem, bukan tambal sulam',
    description:
      'Pendaftaran sampai laporan SATUSEHAT jalan di data yang sama, tanpa pindah aplikasi.',
  },
  {
    icon: 'sparkle',
    color: '#0E8F7F',
    title: 'AI yang ikut bekerja',
    description:
      'Miko di WhatsApp dan AI Assistant di portal, menjawab dari data dan dokumen klinik sendiri.',
  },
  {
    icon: 'cloud',
    color: '#0A6FA0',
    title: 'Laporan SATUSEHAT lengkap',
    description:
      'Resep, hasil lab, dan imunisasi ikut terkirim dari catatan pemeriksaan yang sama.',
  },
  {
    icon: 'shield',
    color: '#5B45F0',
    title: 'Aman sejak rancangan',
    description: 'Hak akses per peran, dan setiap akses ke data pasien tercatat.',
  },
];
