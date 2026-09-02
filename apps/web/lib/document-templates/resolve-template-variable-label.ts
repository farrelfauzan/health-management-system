import type { TemplateVariable } from '@hms/shared-types';

const ENGLISH_LOCALE = 'en';

export function resolveTemplateVariableLabel(variable: TemplateVariable, locale: string): string {
  return locale === ENGLISH_LOCALE ? variable.labelEn : variable.labelId;
}
