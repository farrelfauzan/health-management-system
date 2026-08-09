/**
 * Every reply this codebase authors rather than asks a model for.
 *
 * A template is used wherever the *right* answer must not depend on an
 * upstream API being reachable or on a model choosing well. That is a
 * different bar from "the model would probably say this": someone describing
 * chest pain gets the ambulance number whether or not the provider is up, and
 * someone who volunteered a NIK gets told to bring documents to the clinic
 * whether or not the model noticed.
 *
 * Bahasa Indonesia first because that is what the clinic's customers write
 * (§6); the English line follows for the minority who do not, and because a
 * bilingual template needs no model call to pick a language.
 */
export const CS_REPLY_TEMPLATES = {
  /**
   * §8.2's one-line notice, sent once at the top of a new conversation. It
   * names the three things a data subject is owed: that this is automated,
   * what their data is used for, and where the sensitive part happens.
   */
  privacyNotice: [
    'Halo! Anda terhubung dengan asisten otomatis klinik. Saya dapat menjawab pertanyaan seputar layanan klinik dan membantu membuat janji temu.',
    'Data yang Anda kirim di sini hanya dipakai untuk keperluan tersebut. Data sensitif seperti NIK, nomor BPJS, dan riwayat medis dilengkapi langsung di klinik, bukan melalui chat ini.',
  ].join('\n\n'),

  /**
   * Emergencies answer before anything else and without a provider call.
   * 119 is the national ambulance line; naming the nearest ER as well matters
   * because 119 coverage is uneven outside major cities.
   */
  emergency: [
    '🚨 Jika ini keadaan darurat, segera hubungi 119 (ambulans) atau datang ke IGD rumah sakit terdekat sekarang.',
    'Saya asisten otomatis dan tidak dapat menangani keadaan darurat medis.',
    '',
    'If this is an emergency, call 119 or go to the nearest emergency department immediately.',
  ].join('\n'),

  /**
   * Medical questions are out of scope (§1.3) and the honest answer says so
   * without pretending the question was unreasonable.
   */
  medicalQuestion: [
    'Maaf, saya tidak dapat menjawab pertanyaan medis, memberikan diagnosis, atau menyarankan obat.',
    'Untuk keluhan kesehatan, silakan buat janji temu agar diperiksa langsung oleh tenaga kesehatan kami — saya bisa bantu mencarikan jadwal.',
  ].join('\n\n'),

  /**
   * The arrival-completes-data reply (§5.3), sent whenever redaction fired.
   * It is deliberately reassuring rather than admonishing: the customer did
   * a normal thing, and the point is to tell them where it belongs.
   */
  sensitiveDataVolunteered: [
    'Demi keamanan, data seperti NIK, nomor BPJS, atau nomor kartu lain tidak perlu dikirim melalui chat — dan bagian itu sudah saya hapus dari percakapan ini.',
    'Cukup bawa kartu Anda saat datang ke klinik; petugas akan melengkapi datanya di loket pendaftaran.',
  ].join('\n\n'),

  /**
   * Prompt injection gets a flat, boring refusal. Anything more specific
   * tells the sender which pattern fired, which is a free hint for the next
   * attempt.
   */
  injectionBlocked:
    'Maaf, saya hanya dapat membantu dengan pertanyaan seputar layanan klinik dan pembuatan janji temu.',

  /** §8.3's over-limit reply. Polite, and costs no provider call. */
  rateLimited: [
    'Maaf, pesan Anda terlalu banyak dalam waktu singkat. Silakan coba lagi beberapa saat lagi.',
    'Jika mendesak, silakan hubungi loket klinik langsung.',
  ].join('\n\n'),

  /** Acknowledges a handoff so the customer is not left waiting in silence. */
  handoff: [
    'Baik, saya sambungkan ke petugas klinik kami. Mohon tunggu sebentar — pesan Anda sudah kami teruskan.',
    'Petugas akan membalas melalui chat ini pada jam kerja klinik.',
  ].join('\n\n'),

  /**
   * The provider is unreachable. This says the system is at fault rather than
   * inventing an answer, and gives a route that does not depend on it.
   */
  providerUnavailable: [
    'Maaf, saya sedang tidak dapat memproses pesan Anda saat ini.',
    'Silakan coba lagi beberapa saat lagi, atau hubungi loket klinik langsung.',
  ].join('\n\n'),

  /**
   * The Telegram contact-share challenge (§5.1.1 tier 2), sent with a
   * `request_contact` button.
   *
   * It says what is being asked and what happens if the customer would rather
   * not — because "share your phone number" from an automated account is a
   * reasonable thing to refuse, and a customer who refuses must be able to see
   * that their booking still goes through.
   */
  contactShareChallenge: [
    'Sebelum saya selesaikan pemesanan, mohon konfirmasi nomor Anda dengan menekan tombol di bawah.',
    'Jika Anda tidak ingin membagikan nomor, ketik saja "lanjut" — janji temu tetap dibuat dan petugas akan melengkapi datanya saat Anda datang.',
  ].join('\n\n'),

  /**
   * The code challenge (§5.1.1 tier 3). It never says whose record the code
   * went to, or that a record was found at all — the customer already knows
   * their own number, and anyone else must learn nothing.
   */
  otpChallenge: [
    'Untuk melanjutkan, saya sudah mengirimkan kode 6 digit ke nomor yang terdaftar di klinik.',
    'Silakan balas dengan kodenya. Kode berlaku 5 menit.',
    'Jika Anda tidak menerima kode atau tidak ingin melanjutkan, ketik "lanjut" — janji temu tetap dibuat dan datanya dilengkapi di klinik.',
  ].join('\n\n'),

  /** A wrong code, with the count left deliberately vague about what happens at zero. */
  otpWrongCode: 'Kode yang Anda masukkan belum cocok. Silakan coba lagi, atau ketik "lanjut" untuk melewati langkah ini.',

  /**
   * While a challenge is outstanding, anything that is not a code and not the
   * skip word gets this. Short, and it does not spend an attempt — a customer
   * asking a question mid-verification has not guessed wrong at anything.
   */
  otpAwaitingCode:
    'Saya masih menunggu kode 6 digit yang dikirim ke nomor Anda. Balas kodenya, atau ketik "lanjut" untuk melewati langkah ini.',

  /**
   * The code itself, sent to the *registered* number (`PCS-T09`, §5.1.1 tier
   * 3).
   *
   * The one outbound message on this channel that is not a reply, because a
   * possession challenge is by definition addressed to someone who has not
   * written to us. It is therefore written to be read by a stranger: it names
   * the clinic, it says what the code is for, and it says plainly that
   * ignoring it is safe — a person receiving an unexplained six-digit code
   * from an unknown number is being phished, as far as they can tell, and the
   * message has to answer that before it asks for anything.
   *
   * It also asks for nothing. There is no link, no reply-to instruction beyond
   * the chat the customer is already in, and nothing that would train a
   * patient to act on a WhatsApp message claiming to be their clinic.
   */
  otpCodeMessage: (code: string): string =>
    [
      `Kode verifikasi Anda: ${code}`,
      'Kode ini digunakan untuk memastikan pemesanan janji temu lewat chat benar dari Anda. Berlaku 5 menit.',
      'Jika Anda tidak sedang memesan janji temu, abaikan pesan ini. Kami tidak akan pernah meminta NIK, nomor BPJS, atau data lain lewat chat.',
    ].join('\n\n'),
} as const;
