import {
  MidwifeFormularyCandidateRecord,
  MidwifeFormularyItemRecord,
  MidwifeFormularyMatch,
  MidwifeFormularyMatchInput,
  MidwifeFormularyMatchResult,
} from '@hms/shared-types';

/**
 * Matches the clinic's catalog against the midwife formulary template
 * (P25-T04, FR-FORM-02). Pure: everything it needs, including the template
 * codes KFA answered for, arrives in the input.
 *
 * Per item, a catalog row matches in the first way that applies: its product
 * code is in the item's accepted list (`KFA_CODE`); its product's template
 * code is one the item names (`KFA_TEMPLATE`) — the same generic from another
 * manufacturer, which exact codes alone would miss; or its name contains one
 * of the item's keywords (`KEYWORD`), which only suggests a row for the clinic
 * to verify and is never accepted by `apply`. An item no row matches in any
 * way is reported as unmatched.
 */
export function matchMidwifeFormulary(
  input: MidwifeFormularyMatchInput,
): MidwifeFormularyMatchResult {
  const result: MidwifeFormularyMatchResult = { items: [], unmatchedItems: [] };
  for (const item of input.items) {
    const matches = input.medications.flatMap((medication) =>
      toMatch(item, medication, input.templateCodesByKfaCode),
    );
    if (matches.length === 0) {
      result.unmatchedItems.push(item);
      continue;
    }
    result.items.push({ item, matches });
  }
  return result;
}

function toMatch(
  item: MidwifeFormularyItemRecord,
  medication: MidwifeFormularyCandidateRecord,
  templateCodesByKfaCode: ReadonlyMap<string, string>,
): MidwifeFormularyMatch[] {
  const matchedBy = resolveMatchKind(item, medication, templateCodesByKfaCode);
  if (matchedBy === null) {
    return [];
  }
  return [
    {
      medicationId: medication.id,
      name: medication.name,
      kfaCode: medication.kfaCode,
      isMidwifePrescribable: medication.isMidwifePrescribable,
      matchedBy,
    },
  ];
}

function resolveMatchKind(
  item: MidwifeFormularyItemRecord,
  medication: MidwifeFormularyCandidateRecord,
  templateCodesByKfaCode: ReadonlyMap<string, string>,
): MidwifeFormularyMatch['matchedBy'] | null {
  const kfaCode = medication.kfaCode;
  if (kfaCode !== null && item.kfaCodes.includes(kfaCode)) {
    return 'KFA_CODE';
  }
  const templateKfaCode = kfaCode === null ? undefined : templateCodesByKfaCode.get(kfaCode);
  if (templateKfaCode !== undefined && item.kfaTemplateCodes.includes(templateKfaCode)) {
    return 'KFA_TEMPLATE';
  }
  if (hasKeywordMatch(item.matchKeywords, medication.name)) {
    return 'KEYWORD';
  }
  return null;
}

function hasKeywordMatch(keywords: readonly string[], name: string): boolean {
  const normalizedName = name.toLocaleLowerCase();
  return keywords.some((keyword) => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();
    return normalizedKeyword !== '' && normalizedName.includes(normalizedKeyword);
  });
}
