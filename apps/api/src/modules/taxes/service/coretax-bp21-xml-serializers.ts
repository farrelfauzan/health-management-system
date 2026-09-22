import { CoretaxBp21TemplateVersionValue, CoretaxBp21XmlSerializer } from '@hms/shared-types';

import { serializeCoretaxBp21V4Xml } from './serialize-coretax-bp21-v4-xml';

/**
 * One serializer per DJP BP21 template version (P27-T08). A new version is a
 * new entry; an old one stays so a month finalized under it re-exports the
 * same file.
 */
export const CORETAX_BP21_XML_SERIALIZERS: Readonly<
  Record<CoretaxBp21TemplateVersionValue, CoretaxBp21XmlSerializer>
> = {
  V4: serializeCoretaxBp21V4Xml,
};
