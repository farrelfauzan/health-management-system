/**
 * The shared shape of an ICD-10 diagnosis and an ICD-9-CM procedure row as the
 * pickers consume them. Both catalogs answer the same interaction — search a
 * term, pick a code — so one option type serves both and the picker stays a
 * single component.
 */
export type CodeSearchOption = {
  id: string;
  code: string;
  display: string;
  displayIndonesian?: string;
};
