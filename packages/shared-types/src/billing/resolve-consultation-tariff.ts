import type { ClinicianProfessionValue } from '#doctor-management/schemas';

/**
 * Who held the consultation, as billing reads it off the encounter: the poli
 * the clinician practises in and whether they are a dokter or a bidan. Both
 * come from the clinician on the encounter rather than from the queue the
 * patient joined — the bill follows who actually saw the patient, which is
 * not always the poli they took a ticket for.
 */
export type ConsultationAudience = {
  specialtyId: string;
  profession: ClinicianProfessionValue;
};

/**
 * The part of a consultation tariff that decides whether it prices a given
 * visit. `null` on either side means "any": a row with neither set is the
 * clinic-wide fallback.
 */
export type ConsultationTariffAudience = {
  specialtyId: string | null;
  profession: ClinicianProfessionValue | null;
};

/**
 * How well a candidate addresses the visit. Higher wins, and the ranks are
 * deliberately ordered from the most specific claim to the weakest: a price
 * written for bidan in Kebidanan beats one written for Kebidanan, which beats
 * one written for every bidan in the clinic, which beats the fallback.
 */
const NO_MATCH = 0;

const FALLBACK_MATCH = 1;

const PROFESSION_MATCH = 2;

const SPECIALTY_MATCH = 3;

const EXACT_MATCH = 4;

export type ConsultationTariffSelection<TTariff> =
  | { outcome: 'MATCHED'; tariff: TTariff }
  | { outcome: 'NONE' }
  /**
   * Several equally-specific rows claim the visit, which only legacy data can
   * produce: the unique index forbids it for any row that names an audience.
   * Refusing to choose is the point — billing one of two consultation fees at
   * random is the silent mispricing this whole resolution exists to end.
   */
  | { outcome: 'AMBIGUOUS'; tariffs: TTariff[] };

export type ResolveConsultationTariffParams<TTariff extends ConsultationTariffAudience> = {
  /** Active, live CONSULTATION tariffs — the price list, already filtered. */
  candidates: readonly TTariff[];
  audience: ConsultationAudience;
};

function scoreCandidate(
  candidate: ConsultationTariffAudience,
  audience: ConsultationAudience,
): number {
  const matchesSpecialty =
    candidate.specialtyId === null || candidate.specialtyId === audience.specialtyId;
  const matchesProfession =
    candidate.profession === null || candidate.profession === audience.profession;
  if (!matchesSpecialty || !matchesProfession) {
    return NO_MATCH;
  }
  if (candidate.specialtyId !== null && candidate.profession !== null) {
    return EXACT_MATCH;
  }
  if (candidate.specialtyId !== null) {
    return SPECIALTY_MATCH;
  }
  return candidate.profession !== null ? PROFESSION_MATCH : FALLBACK_MATCH;
}

/**
 * Picks the consultation fee for one visit from the clinic's price list.
 *
 * A clinic that prices consultations once keeps one untagged row and every
 * visit resolves to it, exactly as before. A clinic that charges a specialist
 * more, or a bidan less, tags those rows and the visit finds its own price
 * without anyone choosing it at the counter.
 */
export function resolveConsultationTariff<TTariff extends ConsultationTariffAudience>(
  params: ResolveConsultationTariffParams<TTariff>,
): ConsultationTariffSelection<TTariff> {
  const { candidates, audience } = params;
  const scored = candidates
    .map((tariff) => ({ tariff, score: scoreCandidate(tariff, audience) }))
    .filter((entry) => entry.score !== NO_MATCH);
  if (scored.length === 0) {
    return { outcome: 'NONE' };
  }
  const bestScore = scored.reduce((best, entry) => Math.max(best, entry.score), NO_MATCH);
  const winners = scored.filter((entry) => entry.score === bestScore).map((entry) => entry.tariff);
  if (winners.length > 1) {
    return { outcome: 'AMBIGUOUS', tariffs: winners };
  }
  const [winner] = winners;
  return winner ? { outcome: 'MATCHED', tariff: winner } : { outcome: 'NONE' };
}
