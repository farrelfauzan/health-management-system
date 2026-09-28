const ABBREVIATION_BY_TIME_ZONE: Readonly<Record<string, string>> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
};

/**
 * The Indonesian name for a clinic's time zone, as a clinic writes it after a
 * time ("14.32 WIB"). A zone outside Indonesia keeps its IANA name.
 */
export function resolveTimeZoneAbbreviation(timeZone: string): string {
  return ABBREVIATION_BY_TIME_ZONE[timeZone] ?? timeZone;
}
