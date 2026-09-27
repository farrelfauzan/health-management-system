import type { ReactElement } from 'react';

import { buildStructuredData } from '#lib/landing/build-structured-data';

/** Emits the page's JSON-LD; `<` is escaped so the payload can never close the script tag. */
export function StructuredData(): ReactElement {
  const json = JSON.stringify(buildStructuredData()).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
