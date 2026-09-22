import { CoretaxFakturTemplateVersionValue, CoretaxFakturXmlSerializer } from '@hms/shared-types';

import { serializeCoretaxFakturV16Xml } from './serialize-coretax-faktur-v1-6-xml';

/**
 * One serializer per DJP Faktur Keluaran template version (P27-T09). A new
 * version is a new entry; an old one stays so a finalized month re-exports
 * the same file.
 */
export const CORETAX_FAKTUR_XML_SERIALIZERS: Readonly<
  Record<CoretaxFakturTemplateVersionValue, CoretaxFakturXmlSerializer>
> = {
  V1_6: serializeCoretaxFakturV16Xml,
};
