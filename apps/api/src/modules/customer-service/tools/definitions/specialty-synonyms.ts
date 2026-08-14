/**
 * Indonesian poli names mapped to the English specialty names the clinic
 * stores.
 *
 * `specialties.name` is English — `Pediatrics`, `Dentistry`, `General
 * Practice` — while every customer on this channel types Indonesian. The
 * substring match in `list_available_sessions` therefore could not succeed for
 * *any* poli a customer would actually name: `"pediatrics".includes("anak")`
 * is false, and so is every other pairing. The tool answered "no schedule
 * found" for schedules that existed.
 *
 * This table is the translation layer, and it lives in code rather than in the
 * database deliberately. The English names are what BPJS poli codes and the
 * staff dashboard are keyed on, so renaming the rows would move the breakage
 * rather than fix it; an `aliases` column is the better long-term shape, but it
 * is a migration and an admin screen for something that changes about as often
 * as Indonesian medicine acquires a new specialty.
 *
 * **Aliases are matched as substrings of what the customer typed**, so `anak`
 * covers "poli anak", "dokter anak" and "spesialis anak" without listing all
 * three. That cuts the other way too, which is why `dalam` appears only in its
 * two-word forms: bare `dalam` is an ordinary Indonesian preposition and would
 * match phrases that have nothing to do with internal medicine.
 */
export const SPECIALTY_SYNONYMS: readonly {
  readonly specialty: string;
  readonly aliases: readonly string[];
}[] = [
  { specialty: 'general practice', aliases: ['umum'] },
  { specialty: 'internal medicine', aliases: ['penyakit dalam', 'poli dalam', 'internis'] },
  { specialty: 'pediatrics', aliases: ['anak'] },
  { specialty: 'dentistry', aliases: ['gigi'] },
  { specialty: 'cardiology', aliases: ['jantung', 'kardiologi'] },
  { specialty: 'psychiatry', aliases: ['jiwa', 'psikiatri'] },
  { specialty: 'pulmonology', aliases: ['paru'] },
  { specialty: 'orthopedics', aliases: ['tulang', 'ortopedi'] },
  { specialty: 'obstetrics', aliases: ['kandungan', 'kebidanan', 'obgyn'] },
  { specialty: 'urology', aliases: ['urologi', 'saluran kemih'] },
  { specialty: 'general surgery', aliases: ['bedah'] },
  { specialty: 'otorhinolaryngology', aliases: ['tht', 'telinga', 'hidung', 'tenggorokan'] },
  { specialty: 'neurology', aliases: ['saraf', 'syaraf', 'neurologi'] },
  { specialty: 'anesthesiology', aliases: ['anestesi', 'bius'] },
  { specialty: 'dermatology', aliases: ['kulit', 'kelamin'] },
  { specialty: 'radiology', aliases: ['radiologi', 'rontgen'] },
  { specialty: 'ophthalmology', aliases: ['mata'] },
];
