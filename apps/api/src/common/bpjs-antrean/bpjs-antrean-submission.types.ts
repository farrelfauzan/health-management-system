/**
 * Outbound Antrean Online payload shapes (P14-T05).
 *
 * Every field name here is spike question Q2 wearing executable code: they
 * come from the circulated *Dokumen UAT Bridging Antrol v2.0 FKTP* and the
 * reference implementations in `docs/post-mvp/bpjs-antrean-online.md` §8, and
 * none has been confirmed against a live BPJS environment. The evaluation's
 * §2.2 table is the closest thing to a source, and it leans FKRTL.
 *
 * Kept in `common/bpjs-antrean` rather than `@hms/shared-types` for the same
 * reason the PCare payloads are: these are wire formats for one upstream, not
 * a contract the web app consumes. Nothing in `apps/web` should ever be able
 * to import them.
 */

/**
 * `antrean/add` — publishes an onsite (walk-in) queue entry.
 *
 * **Walk-ins only.** A Mobile JKN booking arrived through the inbound
 * `ambil antrean` service (P14-T04) and is already BPJS's own row; publishing
 * it back would hand the member a second queue number for the same visit. The
 * enqueue hook is what enforces that, keyed on `Appointment.bpjsBookingCode`.
 */
export type BpjsAntreanAddPayload = {
  readonly kodebooking: string;
  readonly jenispasien: string;
  readonly nomorkartu: string;
  readonly nik: string;
  readonly nohp: string;
  readonly kodepoli: string;
  readonly namapoli: string;
  readonly norm: string;
  readonly tanggalperiksa: string;
  readonly kodedokter: string;
  readonly namadokter: string;
  readonly jampraktek: string;
  readonly nomorantrean: string;
  readonly angkaantrean: number;
  readonly estimasidilayani: number;
  readonly keterangan: string;
};

/**
 * `antrean/panggil` — reports queue progress.
 *
 * Whether FKTP uses this simple status/time pair or FKRTL's `taskid`
 * vocabulary is spike question **Q1**, and it is the first thing the spike
 * must settle. If task IDs turn out to apply, this payload is replaced rather
 * than extended, and HMS additionally has to record a "patient called" event
 * it does not have today (§3.5) — which is a registration-lifecycle change,
 * not a payload change.
 */
export type BpjsAntreanPanggilPayload = {
  readonly tanggalperiksa: string;
  readonly kodepoli: string;
  readonly nomorkartu: string;
  readonly status: number;
  readonly waktu: number;
};

/**
 * `antrean/batal` — withdraws a queue entry the clinic published.
 *
 * Addressed by (date, poli, card number) rather than by `kodebooking`, which
 * is what the evaluation's §2.2 table records for FKTP. That is worth noting
 * because the *inbound* cancel (P14-T04) is addressed by booking code — the
 * two directions are not symmetric in the sources, and Q2/Q5 is where that
 * gets confirmed.
 */
export type BpjsAntreanBatalPayload = {
  readonly tanggalperiksa: string;
  readonly kodepoli: string;
  readonly nomorkartu: string;
  readonly alasan: string;
};
