/** A schema.org JSON-LD document: one `@context` and a graph of linked nodes. */
export type StructuredDataGraph = {
  readonly '@context': 'https://schema.org';
  readonly '@graph': readonly Readonly<Record<string, unknown>>[];
};
