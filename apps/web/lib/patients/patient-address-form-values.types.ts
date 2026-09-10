/**
 * The structured half of a patient address, keyed exactly as the create and
 * update schemas key it (`P19-T11`). The street line is not here: it stays the
 * plain `address` field it has always been, validated against the same schema
 * as before.
 *
 * Every value is a string because that is what an input and a combobox hold; a
 * blank means "not chosen" and is dropped rather than sent, the way the rest of
 * this form treats a blank.
 *
 * `provinceName` and the three names beside it are not stored on the patient —
 * the API resolves them at read time. They travel here only so an edit can show
 * the chain before the four region lists have loaded.
 */
export type PatientAddressFormValues = {
  provinceCode: string;
  provinceName: string;
  regencyCode: string;
  regencyName: string;
  districtCode: string;
  districtName: string;
  villageCode: string;
  villageName: string;
  rtRw: string;
  postalCode: string;
};
