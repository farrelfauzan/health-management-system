import type { FaqItem } from '#lib/landing/faq-item';

/**
 * Questions clinic owners ask before switching. Every answer describes what the product
 * does today (checked against the code on 2026-09-27); keep it that way when editing.
 * The same list feeds the FAQPage JSON-LD.
 */
export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'Apakah MetaKlinik sudah terhubung dengan SATUSEHAT?',
    answer:
      'Sudah. Saat kunjungan ditutup, data kunjungan, diagnosis, tanda vital, tindakan, resep, dan imunisasi terkirim otomatis ke SATUSEHAT. Hasil lab, rawat inap, dan episode kehamilan ikut terkirim. Status setiap kiriman bisa dipantau dan dikirim ulang dari portal.',
  },
  {
    question: 'Klinik kami sudah memakai RME lain. Apakah bisa pindah?',
    answer:
      'Bisa. Nomor rekam medis lama tetap berlaku, jadi pasien tidak perlu nomor baru. Tim kami membantu memindahkan data dokter, obat, dan tarif layanan supaya klinik tetap berjalan selama masa peralihan.',
  },
  {
    question: 'Apakah bisa dicoba dulu sebelum berlangganan?',
    answer:
      'Bisa. Klinik dapat mencoba MetaKlinik gratis selama 1 bulan sebagai klinik pilot sebelum memutuskan.',
  },
  {
    question: 'Apa saja yang bisa dilakukan Miko di WhatsApp?',
    answer:
      'Miko menjawab pertanyaan pasien dari dokumen klinik yang sudah disetujui, menunjukkan sesi praktik dokter yang masih kosong, lalu mendaftarkan kunjungan dengan kode booking. Miko tidak memberi diagnosis. Pesan darurat diarahkan ke 119 atau IGD rumah sakit terdekat, dan staf bisa mengambil alih percakapan kapan saja.',
  },
  {
    question: 'Apakah AI Assistant bisa membuka data semua pasien?',
    answer:
      'Tidak. AI Assistant hanya membuka data yang boleh dilihat oleh peran penanya. Untuk admin, jawabannya berupa angka ringkasan tanpa nama pasien. Angka yang ditampilkan diambil langsung dari sistem, bukan dikarang AI.',
  },
  {
    question: 'Siapa saja yang bisa membuka rekam medis pasien?',
    answer:
      'Rekam medis hanya bisa dibuka tenaga medis yang menangani pasien. Hak akses diatur per peran (admin, dokter, bidan, apoteker, analis lab), dan setiap akses ke data pasien tercatat.',
  },
  {
    question: 'Apakah MetaKlinik cocok untuk praktik bidan?',
    answer:
      'Cocok. Tersedia pencatatan kehamilan dan ANC dengan daftar periksa 10T, persalinan dan bayi baru lahir, nifas dan KB, skrining SHK, surat keterangan hamil dan lahir, serta laporan kohort ibu, bayi, dan KB.',
  },
  {
    question: 'Apakah sudah terhubung dengan BPJS?',
    answer:
      'MetaKlinik sudah siap terhubung dengan BPJS: PCare, Antrean, dan rekap klaim non-kapitasi untuk layanan bidan. Koneksi diaktifkan dengan kredensial BPJS milik klinik.',
  },
  {
    question: 'Apakah perlu memasang aplikasi di komputer?',
    answer:
      'Tidak perlu. MetaKlinik berbasis web, jadi cukup dibuka lewat browser tanpa instalasi.',
  },
];
