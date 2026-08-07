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
} as const;
