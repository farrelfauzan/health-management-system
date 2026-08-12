#!/usr/bin/env node
/**
 * Generates the weak-password denylist consumed by
 * `BREACHED_PASSWORD_LIST_PATH` (SJ-7).
 *
 * WHAT THIS IS NOT: a copy of a real breach corpus. It is not RockYou, not
 * SecLists, not Have I Been Pwned. Nobody here downloaded ten thousand
 * passwords from a leak.
 *
 * WHAT IT IS: a deterministic expansion of the patterns that dominate those
 * corpora — dictionary words, names, keyboard walks and numeric runs, each
 * crossed with the handful of suffixes people actually append. Real top-10k
 * lists are overwhelmingly made of exactly this, which is why the expansion is
 * worth something rather than being padding. Every entry it produces is a
 * password a cracking rig would try early.
 *
 * If you ever have a machine with internet access, the real thing is better,
 * and swapping it in is a path change with no code change:
 *
 *   curl -o infra/wordlists/breached-passwords.txt \
 *     https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10-million-password-list-top-10000.txt
 *
 * The API merges whatever this points at with its own compiled-in list, so a
 * bigger file never loses the Indonesian and clinic-domain entries.
 *
 * Usage:
 *   node infra/wordlists/generate-weak-passwords.mjs > infra/wordlists/breached-passwords.txt
 */

/** Passwords that top essentially every published breach ranking. */
const NOTORIOUS = `
123456 password 123456789 12345678 12345 qwerty 1234567 111111 1234567890 123123
000000 iloveyou 1234 1q2w3e4r5t qwertyuiop 123 monkey dragon 654321 123321
666666 1qaz2wsx myspace1 121212 homelesspa 123qwe a123456 123abc 1q2w3e4r qwe123
7777777 qwerty123 target123 tinkle 987654321 qwerty1 222222 zxcvbnm 1g2w3e4r asdfghjkl
`;

/** Ordinary English words that show up as passwords far more than chance. */
const ENGLISH_WORDS = `
love sunshine princess football baseball master shadow michael jennifer jordan
superman harley ranger buster thomas robert soccer batman test pass killer
hockey george charlie andrew michelle jessica pepper daniel starwars klaster
computer summer ashley nicole chelsea biteme matthew access yankees dallas
austin thunder taylor matrix mobile monitor liverpool secret tigger purple
angel samsung whatever cheese amanda maggie ginger joshua hunter freedom
trustno1 letmein welcome admin guest login user root toor default temp
demo oracle jenkins gitlab docker redis mongo mysql postgres kubernetes
flower orange banana apple silver golden diamond phoenix eagle falcon
winter spring autumn january february monday friday sunday morning evening
coffee chocolate cookie butterfly rainbow universe galaxy rocket engine
hello world family friend forever always happy lucky magic dream
green yellow purple orange silver bronze marble crystal shadow storm
mother father sister brother baby girl boyfriend girlfriend darling honey
`;

/** Indonesian words and names. An English-only list misses these entirely. */
const INDONESIAN_WORDS = `
rahasia sayang cinta indonesia jakarta surabaya bandung semarang medan makassar
bogor depok tangerang bekasi malang yogyakarta jogja solo denpasar palembang
aku kamu kita saya anda rumah keluarga ibu bapak ayah anak kakak adik
sahabat teman kasih hati bunga bintang bulan matahari langit laut gunung
merdeka pancasila garuda nusantara bhinneka jaya sakti mulia sejahtera
selamat semangat berkah rezeki syukur amanah ikhlas sabar tenang bahagia
kucing anjing harimau elang naga singa macan kuda burung ikan
biru merah hijau kuning putih hitam ungu jingga emas perak
januari februari maret april agustus september oktober november desember
senin selasa rabu kamis jumat sabtu minggu pagi siang malam
`;

/** The clinic's own vocabulary — the first thing a local attacker guesses. */
const CLINIC_WORDS = `
klinik clinic hospital rumahsakit puskesmas apotek apotik farmasi dokter doctor
perawat nurse pasien patient bidan medis medical kesehatan health obat medicine
resep rekammedis rekam antrian antrean pendaftaran poli poliklinik igd ugd
bpjs jkn kis satusehat kemenkes dinkes labor laboratorium radiologi rontgen
salingjaga sjaga hms admin1 adminklinik adminrs operator kasir
`;

/** Names, which are the single largest category in most real corpora. */
const NAMES = `
budi agus andi dewi siti sri ayu rina rini dian indra putra putri wati
yanti yuli nur muhammad ahmad abdul rizki rizky bayu adit aditya fajar
hendra irfan ikhsan joko bambang slamet wahyu eko dedi deni tono tono
maria anna john david james robert michael william richard joseph thomas
charles daniel matthew anthony mark steven paul andrew joshua kevin brian
sarah jessica linda barbara elizabeth susan margaret dorothy lisa nancy
karen betty helen sandra donna carol ruth sharon michelle laura kimberly
`;

/** Keyboard walks — no dictionary needed to guess these. */
const KEYBOARD_WALKS = `
qwerty qwertyui asdfgh asdfghjk zxcvbn zxcvbnm qazwsx qazwsxedc wsxedc edcrfv
1qaz 2wsx 3edc 4rfv 1qazxsw2 zaq12wsx qwaszx qweasd qweasdzxc poiuy poiuytrewq
lkjhg lkjhgfdsa mnbvc mnbvcxz asdzxc qweqwe asdasd zxczxc qwezxc
`;

/**
 * Suffixes. This is where real lists get their bulk: people satisfy a
 * composition rule by bolting something on the end, and always the same
 * something.
 */
const SUFFIXES = [
  '',
  '1',
  '12',
  '123',
  '1234',
  '12345',
  '123456',
  '!',
  '@',
  '#',
  '01',
  '007',
  '11',
  '22',
  '99',
  '69',
  '88',
  '123!',
  '1!',
  '2020',
  '2021',
  '2022',
  '2023',
  '2024',
  '2025',
  '2026',
];

/** Numeric-only passwords: runs, repeats, keypad shapes and plausible years. */
function buildNumericPasswords() {
  const numeric = new Set();
  for (let digit = 0; digit <= 9; digit += 1) {
    for (let length = 4; length <= 10; length += 1) {
      numeric.add(String(digit).repeat(length));
    }
  }
  const ascending = '12345678901234567890';
  const descending = '09876543210987654321';
  for (let length = 4; length <= 12; length += 1) {
    numeric.add(ascending.slice(0, length));
    numeric.add(descending.slice(0, length));
  }
  for (let year = 1950; year <= 2030; year += 1) {
    numeric.add(String(year));
    numeric.add(`${year}${year}`);
  }
  for (const pair of ['1212', '2121', '1010', '2020', '1122', '1313', '4321', '54321', '112233', '123123', '321321', '102030', '112358']) {
    numeric.add(pair);
  }
  return [...numeric];
}

function splitWords(block) {
  return block.split(/\s+/).filter((word) => word.length > 0);
}

function main() {
  const roots = [
    ...splitWords(NOTORIOUS),
    ...splitWords(ENGLISH_WORDS),
    ...splitWords(INDONESIAN_WORDS),
    ...splitWords(CLINIC_WORDS),
    ...splitWords(NAMES),
    ...splitWords(KEYBOARD_WALKS),
  ];

  const passwords = new Set();
  for (const root of roots) {
    for (const suffix of SUFFIXES) {
      const candidate = `${root}${suffix}`.toLowerCase();
      // Below 4 characters nothing can be typed that the 12-character policy
      // floor would have allowed anyway; keeping them only inflates the file.
      if (candidate.length >= 4 && candidate.length <= 64) {
        passwords.add(candidate);
      }
    }
  }
  for (const numeric of buildNumericPasswords()) {
    passwords.add(numeric);
  }

  // Sorted so regenerating produces a byte-identical file and a diff is
  // readable — this is a build artefact, and an unstable one is useless.
  process.stdout.write([...passwords].sort().join('\n') + '\n');
}

main();
