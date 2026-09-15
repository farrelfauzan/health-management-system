import { MIDWIFE_AUTHORITY_GATED_PROCEDURE_CODES } from '#doctor-management/midwife-authority-gated-procedure-codes';
import type { DoctorAuthorityKindValue } from '#doctor-management/schemas';
import type { ContraceptiveImplantActionValue } from '#emr/schemas';

/**
 * The delegated authority a midwife needs to record this procedure, or `null`
 * when it is within her own authority (P25-T03). Takes the code already
 * resolved from either input path — the catalog row's code or the free
 * `code` — so a caller cannot bypass the gate by choosing the other path.
 *
 * An implant insertion or removal needs `IUD_IMPLANT` whatever code it was
 * recorded under, because no ICD-9-CM code names an implant.
 */
export function resolveMidwifeProcedureAuthorityKind(params: {
  code: string;
  contraceptiveImplantAction?: ContraceptiveImplantActionValue | null;
}): DoctorAuthorityKindValue | null {
  const gatedKind = MIDWIFE_AUTHORITY_GATED_PROCEDURE_CODES[params.code.trim()];
  if (gatedKind !== undefined) {
    return gatedKind;
  }
  const hasImplantAction =
    params.contraceptiveImplantAction !== undefined && params.contraceptiveImplantAction !== null;
  return hasImplantAction ? 'IUD_IMPLANT' : null;
}
