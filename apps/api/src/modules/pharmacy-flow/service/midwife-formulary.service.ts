import {
  ApplyMidwifeFormularyInput,
  MIDWIFE_FORMULARY_MEDICATION_NOT_MATCHED_ERROR_CODE,
  MidwifeFormularyApplyItemResponse,
  MidwifeFormularyApplyResponse,
  MidwifeFormularyCandidateRecord,
  MidwifeFormularyItemRecord,
  MidwifeFormularyItemResponse,
  MidwifeFormularyMatch,
  MidwifeFormularyMatchResult,
  MidwifeFormularyPreview,
  MidwifeFormularyPreviewResponse,
  MidwifeFormularyTemplateLookup,
} from '@hms/shared-types';
import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';

import { SatusehatKfaClient } from '../../../common/satusehat/satusehat-kfa.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { MidwifeFormularyRepository } from '../repository/midwife-formulary.repository';
import { matchMidwifeFormulary } from './match-midwife-formulary';

/** Detail lookups in flight at once; the platform answers one in ~300 ms. */
const TEMPLATE_LOOKUP_CONCURRENCY = 4;
/**
 * The most catalog codes one preview asks KFA about. A klinik bidan catalog
 * is a few dozen rows; past this the preview still runs on exact codes and
 * keywords and says so, rather than holding an administrator for minutes.
 */
const MAX_TEMPLATE_LOOKUPS = 300;

/**
 * The midwife formulary template applied to the clinic's catalog (P25-T04,
 * FR-FORM-02). The preview says what would be flagged and how each row was
 * matched; `apply` recomputes it rather than trusting the client, refuses any
 * id the recomputation does not match by code or template, and never unflags.
 */
@Injectable()
export class MidwifeFormularyService {
  private readonly logger = new Logger(MidwifeFormularyService.name);

  constructor(
    private readonly midwifeFormularyRepository: MidwifeFormularyRepository,
    private readonly kfaClient: SatusehatKfaClient,
  ) {}

  async previewFormulary(): Promise<MidwifeFormularyPreviewResponse> {
    const preview = await this.buildPreview();
    return {
      items: preview.result.items.map(({ item, matches }) => ({
        item: toItemResponse(item),
        matches,
      })),
      unmatchedItems: preview.result.unmatchedItems.map(toItemResponse),
      templateLookup: preview.templateLookup,
    };
  }

  async applyFormulary(
    payload: ApplyMidwifeFormularyInput,
  ): Promise<MidwifeFormularyApplyResponse> {
    const preview = await this.buildPreview();
    const applicable = collectApplicableMatches(preview.result);
    const medicationIds = [...new Set(payload.medicationIds)];
    this.assertAllMatched(medicationIds, applicable);
    const idsToFlag = medicationIds.filter(
      (id) => applicable.get(id)?.isMidwifePrescribable === false,
    );
    if (idsToFlag.length > 0) {
      await this.midwifeFormularyRepository.flagMidwifePrescribable(idsToFlag);
    }
    const flagged = new Set(idsToFlag);
    const items: MidwifeFormularyApplyItemResponse[] = medicationIds.map((medicationId) => ({
      medicationId,
      outcome: flagged.has(medicationId) ? 'FLAGGED' : 'ALREADY_FLAGGED',
    }));
    return {
      flaggedCount: idsToFlag.length,
      alreadyFlaggedCount: medicationIds.length - idsToFlag.length,
      items,
    };
  }

  private assertAllMatched(
    medicationIds: string[],
    applicable: ReadonlyMap<string, MidwifeFormularyMatch>,
  ): void {
    const unmatchedIds = medicationIds.filter((id) => !applicable.has(id));
    if (unmatchedIds.length === 0) {
      return;
    }
    throw new UnprocessableEntityException({
      message: 'Some medications are not matched by the midwife formulary template',
      code: MIDWIFE_FORMULARY_MEDICATION_NOT_MATCHED_ERROR_CODE,
      errors: { medicationIds: unmatchedIds },
    });
  }

  private async buildPreview(): Promise<MidwifeFormularyPreview> {
    const [items, medications] = await Promise.all([
      this.midwifeFormularyRepository.listItems(),
      this.midwifeFormularyRepository.listCandidateMedications(),
    ]);
    const templateLookup = await this.resolveTemplateCodes(items, medications);
    return {
      result: matchMidwifeFormulary({
        items,
        medications,
        templateCodesByKfaCode: templateLookup.codes,
      }),
      templateLookup: templateLookup.status,
    };
  }

  /**
   * Asks KFA for the template code behind every catalog product code the
   * exact lists do not already cover. A platform that is not configured or
   * does not answer degrades the preview to exact codes and keywords — and
   * says so — rather than failing it: the clinic can still apply what did
   * match.
   */
  private async resolveTemplateCodes(
    items: MidwifeFormularyItemRecord[],
    medications: MidwifeFormularyCandidateRecord[],
  ): Promise<MidwifeFormularyTemplateLookup> {
    const pendingCodes = selectCodesNeedingTemplate(items, medications);
    if (pendingCodes.length === 0) {
      return { codes: new Map(), status: 'COMPLETED' };
    }
    const codes = new Map<string, string>();
    const isCapped = pendingCodes.length > MAX_TEMPLATE_LOOKUPS;
    try {
      await this.lookupTemplateCodes(pendingCodes.slice(0, MAX_TEMPLATE_LOOKUPS), codes);
    } catch (err) {
      if (!(err instanceof SatusehatError)) {
        throw err;
      }
      this.logger.warn(`KFA template lookup skipped (${err.code}); matching on exact codes only`);
      return { codes, status: 'SKIPPED' };
    }
    return { codes, status: isCapped ? 'SKIPPED' : 'COMPLETED' };
  }

  private async lookupTemplateCodes(kfaCodes: string[], codes: Map<string, string>): Promise<void> {
    for (let index = 0; index < kfaCodes.length; index += TEMPLATE_LOOKUP_CONCURRENCY) {
      const batch = kfaCodes.slice(index, index + TEMPLATE_LOOKUP_CONCURRENCY);
      const products = await Promise.all(batch.map((code) => this.kfaClient.getProduct(code)));
      products.forEach((product, position) => {
        const kfaCode = batch[position];
        if (product?.templateKfaCode && kfaCode !== undefined) {
          codes.set(kfaCode, product.templateKfaCode);
        }
      });
    }
  }
}

/** Catalog codes not in any exact list, when at least one item names a template. */
function selectCodesNeedingTemplate(
  items: MidwifeFormularyItemRecord[],
  medications: MidwifeFormularyCandidateRecord[],
): string[] {
  const hasTemplateCodes = items.some((item) => item.kfaTemplateCodes.length > 0);
  if (!hasTemplateCodes) {
    return [];
  }
  const exactCodes = new Set(items.flatMap((item) => item.kfaCodes));
  const pending = medications
    .map((medication) => medication.kfaCode)
    .filter((kfaCode): kfaCode is string => kfaCode !== null && !exactCodes.has(kfaCode));
  return [...new Set(pending)];
}

/** The matches `apply` accepts: by code or template, never a keyword suggestion. */
function collectApplicableMatches(
  result: MidwifeFormularyMatchResult,
): ReadonlyMap<string, MidwifeFormularyMatch> {
  const applicable = new Map<string, MidwifeFormularyMatch>();
  for (const { matches } of result.items) {
    for (const match of matches) {
      if (match.matchedBy !== 'KEYWORD') {
        applicable.set(match.medicationId, match);
      }
    }
  }
  return applicable;
}

function toItemResponse(item: MidwifeFormularyItemRecord): MidwifeFormularyItemResponse {
  return {
    id: item.id,
    code: item.code,
    displayName: item.displayName,
    group: item.group,
    regulationBasis: item.regulationBasis,
    kfaCodes: item.kfaCodes,
    kfaTemplateCodes: item.kfaTemplateCodes,
    matchKeywords: item.matchKeywords,
    sortOrder: item.sortOrder,
  };
}
