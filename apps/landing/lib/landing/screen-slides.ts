import type { ScreenSlide } from '#lib/landing/screen-slide';

/** Carousel slides; a slide without `imageSrc` shows a labelled placeholder until its screenshot exists. */
export const SCREEN_SLIDES: readonly ScreenSlide[] = [
  {
    id: 'dashboard',
    tag: 'Dasbor',
    tagColor: '#0050CB',
    title: 'Semua yang terjadi hari ini, di satu layar.',
    description:
      'Begitu masuk, admin langsung melihat pasien hari ini, janji temu, dokter yang bertugas, dan resep yang menunggu.',
    route: '/admin/dashboard',
    label: 'Dasbor admin',
    imageSrc: '/screenshots/dashboard.jpg',
  },
  {
    id: 'appointments',
    tag: 'Jadwal praktik',
    tagColor: '#0050CB',
    title: 'Sesi praktik semua dokter, sekali lihat.',
    description:
      'Jam praktik dan jumlah pasien tiap dokter tersusun per hari, minggu, atau bulan. Pendaftaran tinggal memilih sesi yang masih kosong.',
    route: '/admin/appointments',
    label: 'Jadwal sesi praktik',
    imageSrc: '/screenshots/appointments.jpg',
  },
  {
    id: 'emr',
    tag: 'Pemeriksaan',
    tagColor: '#0050CB',
    title: 'Catatan pemeriksaan yang rapi dan lengkap.',
    description: 'Dokter dan bidan mencatat keluhan, diagnosis, tindakan, dan resep di satu layar.',
    route: '/doctor/encounters',
    label: 'Form pemeriksaan dokter',
    imageSrc: null,
  },
  {
    id: 'pharmacy',
    tag: 'Apotek',
    tagColor: '#006A61',
    title: 'Stok obat selalu terpantau.',
    description:
      'Katalog, stok, batas pemesanan ulang, dan lot yang hampir kedaluwarsa di satu layar. Stok hanya berubah lewat penerimaan dan penyerahan obat.',
    route: '/admin/pharmacy',
    label: 'Persediaan obat',
    imageSrc: '/screenshots/pharmacy.jpg',
  },
  {
    id: 'billing',
    tag: 'Kasir',
    tagColor: '#006A61',
    title: 'Tagihan tersusun sendiri.',
    description:
      'Tindakan dan obat langsung masuk tagihan. Status lunas, tarif, dan laporan harian kasir ada di tempat yang sama.',
    route: '/admin/billing',
    label: 'Penagihan dan kasir',
    imageSrc: '/screenshots/billing.jpg',
  },
  {
    id: 'conversation',
    tag: 'Miko di WhatsApp',
    tagColor: '#006A61',
    title: 'Miko menjawab, staf siap mengambil alih.',
    description:
      'Semua chat WhatsApp tersimpan di kotak masuk. Saat pasien butuh bantuan lebih, staf bisa mengambil alih percakapan kapan saja.',
    route: '/admin/conversations',
    label: 'Percakapan WhatsApp',
    imageSrc: '/screenshots/conversation.jpg',
  },
  {
    id: 'ai-assistant',
    tag: 'AI Assistant',
    tagColor: '#0A6FA0',
    title: 'Tanya data klinik dengan bahasa sehari-hari.',
    description:
      'Seberapa ramai antrean hari ini, seberapa penuh jadwal minggu ini, obat apa yang akan kedaluwarsa. Jawabannya sesuai hak akses Anda.',
    route: '/admin/ai-assistant',
    label: 'AI Assistant di portal',
    imageSrc: '/screenshots/ai-assistant.jpg',
  },
  {
    id: 'knowledge-base',
    tag: 'Pengetahuan klinik',
    tagColor: '#5B45F0',
    title: 'Satu tempat untuk FAQ dan SOP klinik.',
    description: 'Dokumen yang diunggah di sini menjadi bahan jawaban Miko dan AI Assistant.',
    route: '/admin/clinic-corpus',
    label: 'Korpus klinik',
    imageSrc: null,
  },
];
