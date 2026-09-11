import { useDebouncedValue } from '#hooks/use-debounced-value';
import {
  getMedicationControllerSearchKfaProductsV1QueryKey,
  medicationControllerSearchKfaProductsV1,
} from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import type { MedicationControllerSearchKfaProductsV1200DataItem } from '#lib/api/generated/model/medicationControllerSearchKfaProductsV1200DataItem';
import type { MedicationControllerSearchKfaProductsV1Params } from '#lib/api/generated/model/medicationControllerSearchKfaProductsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import type { CodeSearchOption } from '#lib/encounters/code-search-option';
import {
  KFA_SEARCH_DEBOUNCE_MS,
  KFA_SEARCH_LIMIT,
  MIN_KFA_SEARCH_LENGTH,
} from '#lib/pharmacy/kfa-search-config';

/**
 * KFA lists the same drug once per manufacturer and pack size, so the product
 * name alone does not tell a pharmacist which row is theirs. The secondary
 * line carries the dosage form and the manufacturer, which is what
 * distinguishes them.
 */
function describeKfaProduct(
  product: MedicationControllerSearchKfaProductsV1200DataItem,
): string | undefined {
  const details = [product.dosageForm, product.manufacturer].filter(
    (detail): detail is string => typeof detail === 'string' && detail.trim() !== '',
  );
  return details.length === 0 ? undefined : details.join(' · ');
}

function toKfaSearchOption(
  product: MedicationControllerSearchKfaProductsV1200DataItem,
): CodeSearchOption {
  return {
    id: product.kfaCode,
    code: product.kfaCode,
    display: product.name,
    displayIndonesian: describeKfaProduct(product),
  };
}

/**
 * Searches the KFA dictionary for the medication catalog form. Debounced here
 * rather than in the input so typing stays responsive: every term that gets
 * through is a live request to SATUSEHAT, not a local table scan.
 */
export function useKfaSearch(search: string) {
  const trimmed = search.trim();
  const debouncedSearch = useDebouncedValue(trimmed, KFA_SEARCH_DEBOUNCE_MS);
  const isEnabled = debouncedSearch.length >= MIN_KFA_SEARCH_LENGTH;
  const requestParams: MedicationControllerSearchKfaProductsV1Params = {
    search: debouncedSearch,
    limit: KFA_SEARCH_LIMIT,
  };

  const query = useApiQuery<MedicationControllerSearchKfaProductsV1200DataItem[]>({
    queryKey: getMedicationControllerSearchKfaProductsV1QueryKey(requestParams),
    queryFn: (signal) => medicationControllerSearchKfaProductsV1(requestParams, signal),
    errorMessage: 'Failed to search the KFA dictionary',
    enabled: isEnabled,
  });

  return {
    ...query,
    products: (query.data ?? []).map(toKfaSearchOption),
    // The term the user is still typing counts as enabled, so the picker shows
    // "searching" through the debounce rather than flashing the hint back.
    isEnabled: trimmed.length >= MIN_KFA_SEARCH_LENGTH,
  };
}
