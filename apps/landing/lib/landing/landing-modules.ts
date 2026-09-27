import type { LandingModule } from '#lib/landing/landing-module';

/**
 * Every product module in badge order. Each workflow was checked against the API and web
 * code (2026-09-27); keep it in sync when a module's behaviour changes.
 */
export const LANDING_MODULES: readonly LandingModule[] = [
  {
    id: 'registration',
    name: 'Pendaftaran & antrean',
    groupId: 'service',
    icon: 'user-plus',
    summary: 'Pasien datang langsung atau dari booking, nomor antrean langsung keluar.',
    steps: [
      {
        title: 'Daftarkan pasien',
        description:
          'Pasien datang langsung, atau dicocokkan dengan janji temu dan booking dari chat.',
      },
      { title: 'Nomor antrean', description: 'Nomor antrean harian dan per poli dibuat otomatis.' },
      {
        title: 'Check-in',
        description: 'Check-in hanya bisa dilakukan di jam praktik dokter hari itu.',
      },
      {
        title: 'Dokter diberi tahu',
        description: 'Dokter atau bidan langsung mendapat notifikasi bahwa pasiennya sudah tiba.',
      },
      {
        title: 'Selesai otomatis',
        description: 'Status pendaftaran selesai sendiri saat pemeriksaan ditutup.',
      },
    ],
  },
  {
    id: 'schedule',
    name: 'Jadwal praktik',
    groupId: 'service',
    icon: 'calendar',
    summary: 'Pasien bergabung ke sesi praktik dokter, tidak perlu berebut jam.',
    steps: [
      {
        title: 'Atur sesi',
        description: 'Jam praktik mingguan tiap dokter, lengkap dengan batas jumlah pasien.',
      },
      {
        title: 'Gabung sesi',
        description: 'Pasien masuk ke sesi yang dipilih dan langsung terkonfirmasi.',
      },
      {
        title: 'Permintaan khusus',
        description: 'Butuh jam tertentu? Ajukan dengan alasan, minimal 3 hari sebelumnya.',
      },
      {
        title: 'Setujui',
        description: 'Admin menyetujui atau menolak, pasien mendapat notifikasi di aplikasi.',
      },
      {
        title: 'Ubah sesi',
        description:
          'Sesi bisa dibatalkan atau dipindah dalam minggu yang sama, pasien ikut diberi tahu.',
      },
    ],
  },
  {
    id: 'emr',
    name: 'Pemeriksaan (RME)',
    groupId: 'service',
    icon: 'stethoscope',
    summary: 'Dokter dan bidan mencatat seluruh pemeriksaan di satu layar.',
    steps: [
      {
        title: 'Buka pemeriksaan',
        description: 'Langsung dari daftar pasien yang sudah check-in.',
      },
      {
        title: 'Tanda vital & SOAP',
        description: 'Tanda vital, keluhan, pemeriksaan fisik, penilaian, dan rencana.',
      },
      {
        title: 'Diagnosis & tindakan',
        description: 'Kode ICD-10 dan ICD-9-CM cukup dicari lewat kotak pencarian.',
      },
      {
        title: 'Resep & order',
        description: 'Resep termasuk racikan, order lab, imunisasi, dan rujukan.',
      },
      {
        title: 'Tutup kunjungan',
        description: 'Saat kunjungan ditutup, datanya otomatis diantrekan ke SATUSEHAT.',
      },
    ],
  },
  {
    id: 'pharmacy',
    name: 'Apotek',
    groupId: 'service',
    icon: 'pill',
    summary: 'Resep dari dokter sampai ke tangan pasien, stok ikut tercatat.',
    steps: [
      {
        title: 'Resep masuk',
        description: 'Resep langsung muncul di antrean apotek. Resep mendesak bisa disaring.',
      },
      {
        title: 'Verifikasi',
        description: 'Apoteker mencentang daftar periksa sebelum obat diserahkan.',
      },
      {
        title: 'Serahkan obat',
        description:
          'Bisa penuh atau sebagian. Stok diambil dari batch yang paling dulu kedaluwarsa.',
      },
      {
        title: 'Terima stok',
        description: 'Penerimaan barang mencatat nomor batch dan tanggal kedaluwarsa.',
      },
      {
        title: 'Pantau stok',
        description: 'Peringatan stok menipis dan daftar obat yang hampir kedaluwarsa.',
      },
    ],
  },
  {
    id: 'laboratory',
    name: 'Laboratorium',
    groupId: 'service',
    icon: 'flask',
    summary: 'Dari order dokter sampai hasil PDF, dengan pemeriksaan oleh dua orang.',
    steps: [
      {
        title: 'Order tes',
        description: 'Dari pemeriksaan dokter, pasien lab yang datang langsung, atau rujukan luar.',
      },
      {
        title: 'Ambil sampel',
        description: 'Cetak label, ambil, terima, atau tolak sampel dengan alasan yang jelas.',
      },
      {
        title: 'Input hasil',
        description:
          'Nilai rendah, tinggi, dan kritis ditandai otomatis. Nilai kritis langsung dikabarkan ke dokter.',
      },
      {
        title: 'Verifikasi',
        description: 'Hasil baru dirilis setelah diperiksa dua orang yang berbeda.',
      },
      {
        title: 'Laporan PDF',
        description: 'Laporan jadi otomatis, tersimpan di data pasien, dan terkirim ke SATUSEHAT.',
      },
    ],
  },
  {
    id: 'inpatient',
    name: 'Rawat inap',
    groupId: 'service',
    icon: 'bed',
    summary: 'Kamar, tempat tidur, dan tagihan menginap dalam satu alur.',
    steps: [
      {
        title: 'Atur kamar',
        description: 'Kelas kamar, bangsal, kamar, dan tempat tidur beserta statusnya.',
      },
      {
        title: 'Masuk rawat inap',
        description: 'Pasien ditempatkan di tempat tidur yang masih tersedia.',
      },
      { title: 'Pindah kamar', description: 'Perpindahan tempat tidur tercatat rapi.' },
      { title: 'Pulang', description: 'Kepulangan pasien dicatat beserta alasannya.' },
      {
        title: 'Tagihan menginap',
        description: 'Biaya kamar per malam otomatis masuk ke tagihan.',
      },
    ],
  },
  {
    id: 'maternal',
    name: 'KIA & kebidanan',
    groupId: 'service',
    icon: 'heart',
    summary: 'Dari kehamilan sampai nifas dan KB, lengkap dengan laporan kohort.',
    steps: [
      {
        title: 'Episode kehamilan',
        description: 'Kunjungan ANC dengan kode K, jadwal per trimester, dan daftar periksa 10T.',
      },
      {
        title: 'Pemeriksaan ANC',
        description: 'Peringatan rujukan, surat rujukan, dan surat keterangan hamil dalam PDF.',
      },
      {
        title: 'Persalinan & bayi',
        description: 'Catat persalinan dan bayi, lalu terbitkan surat keterangan lahir.',
      },
      {
        title: 'Nifas & KB',
        description: 'Jadwal kunjungan nifas dan neonatal, serta akseptor KB yang jatuh tempo.',
      },
      {
        title: 'Laporan',
        description: 'Kohort ibu, bayi, dan KB, serta laporan KIA bulanan dalam CSV atau PDF.',
      },
    ],
  },
  {
    id: 'newborn-screening',
    name: 'Skrining SHK',
    groupId: 'service',
    icon: 'drop',
    summary: 'Skrining hipotiroid kongenital untuk setiap bayi yang lahir di klinik.',
    steps: [
      {
        title: 'Dibuat otomatis',
        description: 'Setiap bayi lahir hidup langsung punya tugas SHK, jatuh tempo 48–72 jam.',
      },
      {
        title: 'Ambil sampel',
        description: 'Sampel tumit dicatat. Bayi yang terlambat terlihat di daftar kerja.',
      },
      { title: 'Kirim ke lab', description: 'Kartu SHK ditandai sudah dikirim ke lab rujukan.' },
      {
        title: 'Catat hasil',
        description: 'Normal, perlu dipanggil ulang, atau sampel tidak valid.',
      },
      {
        title: 'Panggil ulang',
        description: 'Hasil ulang otomatis membuka sampel baru dan memberi tahu tenaga medis.',
      },
    ],
  },
  {
    id: 'billing',
    name: 'Kasir & tagihan',
    groupId: 'finance',
    icon: 'receipt',
    summary: 'Tagihan tersusun dari kunjungan, pembayaran tercatat, laporan harian siap.',
    steps: [
      {
        title: 'Buat tagihan',
        description:
          'Konsultasi, tindakan, obat, lab, imunisasi, dan kamar tersusun otomatis dari kunjungan.',
      },
      { title: 'Terbitkan', description: 'Nomor invoice otomatis, PDF lengkap dengan terbilang.' },
      { title: 'Catat pembayaran', description: 'Tunai, transfer, QRIS, atau asuransi.' },
      { title: 'Kirim', description: 'Invoice dikirim ke pasien lewat WhatsApp atau email.' },
      {
        title: 'Laporan harian',
        description: 'Rekap per metode bayar, per dokter, dan per jenis layanan.',
      },
    ],
  },
  {
    id: 'clinician-fee',
    name: 'Jasa medis',
    groupId: 'finance',
    icon: 'coins',
    summary: 'Bagi hasil dokter dihitung sendiri setiap tagihan lunas.',
    steps: [
      {
        title: 'Atur aturan',
        description:
          'Persentase atau nominal tetap, per tarif atau kategori, per dokter atau semua.',
      },
      { title: 'Tagihan lunas', description: 'Jasa medis tercatat otomatis saat tagihan dibayar.' },
      { title: 'Koreksi otomatis', description: 'Tagihan dibatalkan, jasa medisnya ikut dibalik.' },
      { title: 'Rekap bulanan', description: 'Laporan bulanan per dokter dan bidan.' },
      { title: 'Ekspor', description: 'Unduh dalam CSV untuk proses pembayaran.' },
    ],
  },
  {
    id: 'tax',
    name: 'Pajak klinik',
    groupId: 'finance',
    icon: 'landmark',
    summary: 'Pajak terhitung dari tagihan, laporan siap untuk Coretax.',
    steps: [
      {
        title: 'Profil pajak',
        description: 'Status PKP, rezim pajak, dan kode pajak untuk tiap tarif.',
      },
      { title: 'Pajak otomatis', description: 'Pajak dihitung di setiap invoice.' },
      {
        title: 'Laporan bulanan',
        description: 'PP 55 omzet, PPN keluaran, dan PPh 21 jasa medis dalam PDF dan CSV.',
      },
      { title: 'Ekspor Coretax', description: 'File XML untuk faktur dan bukti potong.' },
      { title: 'Pengingat', description: 'Pengingat 5 hari dan 1 hari sebelum jatuh tempo.' },
    ],
  },
  {
    id: 'documents',
    name: 'Dokumen & surat',
    groupId: 'finance',
    icon: 'file',
    summary: 'Surat dan hasil keluar dalam PDF, dikirim aman ke pasien.',
    steps: [
      {
        title: 'PDF otomatis',
        description:
          'Invoice, resep, pengantar lab, hasil lab, rujukan ANC, keterangan hamil, dan keterangan lahir.',
      },
      {
        title: 'Izin pasien',
        description: 'Pengiriman lewat WhatsApp atau email hanya dengan persetujuan pasien.',
      },
      {
        title: 'Kirim aman',
        description:
          'PDF dikunci dengan tanggal lahir pasien, atau berupa tautan yang bisa kedaluwarsa.',
      },
      {
        title: 'Lacak kiriman',
        description: 'Staf bisa membatalkan, menjadwalkan ulang, atau mencabut kiriman.',
      },
      {
        title: 'Template sendiri',
        description: 'Unggah template DOCX klinik, setujui, lalu jadikan standar.',
      },
    ],
  },
  {
    id: 'whatsapp-assistant',
    name: 'Miko di WhatsApp',
    groupId: 'ai',
    icon: 'chat',
    summary: 'Pasien chat ke nomor klinik, Miko menjawab dan mendaftarkan.',
    steps: [
      { title: 'Chat masuk', description: 'Lewat nomor WhatsApp atau Telegram klinik.' },
      {
        title: 'Jawab dari dokumen',
        description: 'Miko hanya menjawab dari dokumen klinik yang sudah disetujui.',
      },
      {
        title: 'Cari sesi',
        description: 'Paham kata seperti “besok” dan langsung menunjukkan sesi yang masih kosong.',
      },
      {
        title: 'Booking',
        description: 'Pasien dapat kode booking. Identitas dicek lewat OTP, tanpa meminta NIK.',
      },
      {
        title: 'Serahkan ke staf',
        description: 'Darurat atau pasien ingin bicara dengan orang, staf langsung mengambil alih.',
      },
    ],
  },
  {
    id: 'ai-assistant',
    name: 'AI Assistant',
    groupId: 'ai',
    icon: 'sparkle',
    summary: 'Staf bertanya dengan bahasa sehari-hari, jawabannya diambil dari data klinik.',
    steps: [
      {
        title: 'Tanya',
        description: '“Obat apa yang akan kedaluwarsa?” atau “Berapa pendapatan kasir hari ini?”',
      },
      {
        title: 'Cek hak akses',
        description: 'Data hanya dibuka bila peran dan izin penanya cocok.',
      },
      {
        title: 'Ambil data',
        description: 'Antrean, jadwal, stok obat, laporan kasir, atau ringkasan pasien.',
      },
      {
        title: 'Angka asli',
        description: 'Angka ditampilkan langsung dari sistem, bukan dikarang AI.',
      },
      {
        title: 'Pilih penyedia AI',
        description: 'Klinik bebas memilih OpenAI, Anthropic, Gemini, dan lainnya.',
      },
    ],
  },
  {
    id: 'knowledge-base',
    name: 'Pengetahuan klinik',
    groupId: 'ai',
    icon: 'book',
    summary: 'Dokumen klinik menjadi bahan jawaban Miko dan AI Assistant.',
    steps: [
      { title: 'Unggah', description: 'Admin mengunggah FAQ dan SOP klinik.' },
      { title: 'Setujui', description: 'Dokumen diperiksa dulu sebelum dipakai untuk menjawab.' },
      { title: 'Diolah otomatis', description: 'Isi dokumen dipecah dan diindeks otomatis.' },
      {
        title: 'Pencarian cerdas',
        description:
          'Mencari berdasarkan makna dan kata kunci. Dokumen bisa khusus staf atau boleh dilihat pasien.',
      },
      {
        title: 'Catatan pribadi',
        description: 'Tiap dokter dan admin punya basis pengetahuan pribadi untuk AI-nya sendiri.',
      },
    ],
  },
  {
    id: 'satusehat',
    name: 'SATUSEHAT',
    groupId: 'integration',
    icon: 'cloud',
    summary: 'Data kunjungan terkirim sendiri, klinik tinggal memantau.',
    steps: [
      {
        title: 'Hubungkan identitas',
        description: 'Pasien dan dokter ditautkan ke nomor IHS, lokasi klinik didaftarkan.',
      },
      {
        title: 'Verifikasi pasien',
        description: 'Cek identitas pasien langsung dari halaman pasien.',
      },
      {
        title: 'Kirim otomatis',
        description:
          'Kunjungan, diagnosis, tanda vital, tindakan, resep, dan imunisasi terkirim saat kunjungan ditutup.',
      },
      {
        title: 'Lab & rawat inap',
        description: 'Hasil lab, rawat inap, dan episode kehamilan ikut terkirim.',
      },
      {
        title: 'Pantau & ulangi',
        description: 'Status tiap kiriman terlihat, bisa dicek ulang atau dikirim ulang.',
      },
    ],
  },
  {
    id: 'bpjs',
    name: 'BPJS',
    groupId: 'integration',
    icon: 'id-card',
    summary: 'Siap terhubung ke BPJS: PCare, Antrean, dan klaim non-kapitasi.',
    steps: [
      { title: 'Hubungkan', description: 'Masukkan kredensial klinik dan uji koneksi.' },
      {
        title: 'Cek kepesertaan',
        description: 'Status kepesertaan pasien dicek dari halaman pasien.',
      },
      {
        title: 'Kirim otomatis',
        description: 'Pendaftaran saat check-in, kunjungan saat ditutup, obat saat diserahkan.',
      },
      {
        title: 'Pantau',
        description: 'Status kiriman dan laporan bulanan, lengkap dengan kirim ulang.',
      },
      {
        title: 'Klaim non-kapitasi',
        description: 'Rekap layanan bidan bulanan dengan tarif terbaru dan surat pengantar PDF.',
      },
    ],
  },
  {
    id: 'access-control',
    name: 'Hak akses & audit',
    groupId: 'integration',
    icon: 'lock',
    summary: 'Setiap orang hanya membuka yang perlu, setiap akses tercatat.',
    steps: [
      { title: 'Undang staf', description: 'Lewat tautan undangan yang dikirim ke email.' },
      {
        title: 'Tetapkan peran',
        description: 'Admin, dokter, bidan, apoteker, analis lab, atau peran buatan sendiri.',
      },
      { title: 'Atur izin', description: 'Matriks izin per peran, lengkap dengan templat.' },
      {
        title: 'Jejak audit',
        description: 'Setiap akses ke data pasien tercatat, termasuk ekspor.',
      },
      {
        title: 'Offboarding',
        description: 'Akses staf yang keluar dicabut, dokumen pribadinya dibersihkan.',
      },
    ],
  },
];
