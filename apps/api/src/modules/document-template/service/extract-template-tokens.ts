import { Element } from 'domhandler';
import * as domutils from 'domutils';
import * as htmlparser2 from 'htmlparser2';

const TOKEN_ATTRIBUTE = 'data-hms-var';

/**
 * Every distinct `data-hms-var` token in a sanitised template, in document
 * order. Reads the DOM rather than regex-matching the string so the answer is
 * the same one the render service walks (`P16-T12`).
 */
export function extractTemplateTokens(contentHtml: string): string[] {
  const dom = htmlparser2.parseDocument(contentHtml);
  const tokenElements = domutils.findAll(
    (node): node is Element => node instanceof Element && node.attribs[TOKEN_ATTRIBUTE] !== undefined,
    [dom],
  );
  const tokens = tokenElements
    .map((element) => element.attribs[TOKEN_ATTRIBUTE] ?? '')
    .filter((token) => token !== '');
  return [...new Set(tokens)];
}
