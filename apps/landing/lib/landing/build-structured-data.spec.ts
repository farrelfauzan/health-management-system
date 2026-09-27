import { describe, expect, it } from 'vitest';

import { buildStructuredData } from '#lib/landing/build-structured-data';
import { FAQ_ITEMS } from '#lib/landing/faq-items';
import { SITE_URL } from '#lib/landing/site-url';

describe('buildStructuredData', () => {
  it('links the website and the software to one organisation', () => {
    const graph = buildStructuredData()['@graph'];
    const publishers = graph.filter((node) => node.publisher).map((node) => node.publisher);
    expect(publishers).toEqual([
      { '@id': `${SITE_URL}/#organization` },
      { '@id': `${SITE_URL}/#organization` },
    ]);
  });

  it('only lists screenshots that exist, as absolute URLs', () => {
    const software = buildStructuredData()['@graph'].find(
      (node) => node['@type'] === 'SoftwareApplication',
    );
    const screenshots = software?.screenshot as readonly string[];
    expect(screenshots.length).toBeGreaterThan(0);
    expect(screenshots.every((url) => url.startsWith(`${SITE_URL}/screenshots/`))).toBe(true);
  });

  it('mirrors every visible FAQ question in the FAQPage node', () => {
    const faq = buildStructuredData()['@graph'].find((node) => node['@type'] === 'FAQPage');
    const questions = (faq?.mainEntity as readonly { name: string }[]).map((entry) => entry.name);
    expect(questions).toEqual(FAQ_ITEMS.map((item) => item.question));
  });
});
