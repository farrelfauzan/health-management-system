# Clinic-authored HTML: the sanitiser review (P16-T21 §1)

Phase 16 put clinic-authored rich text on a path that ends in a Chromium
process. `apps/api/src/common/html/sanitise-rich-text-html.ts` is the control
between the two. This is the record of the adversarial pass over it
(NFR-SEC-01, R-2), and of what the review decided to leave alone.

**Result: no vector in the corpus survived.** No finding was left open.

## What the sanitiser is, and what it is not

- It is **server-side and on every write path**: template create, update and
  publish (`DocumentTemplateService`), and managed-document drafts
  (`ManagedDocumentService`). Whatever the TipTap editor does client-side is a
  convenience; it is never the control. Verified by reading every caller of
  `contentHtml` — there is no write that bypasses it, including the
  `.docx` import path, which sanitises its converted output before storing.
- It is **allowlist-everything**: elements, attributes, CSS properties, CSS
  value shapes and URL schemes are each enumerated, and anything outside the
  list is *dropped* rather than escaped.
- It is **not** the only control. The renderer is network-denied (D-026), the
  bucket is private, and every download carries `Content-Disposition:
  attachment` with a pinned type. The sanitiser failing open would be serious;
  it would not be sufficient on its own to reach a browser.

## The two rules that do most of the work

**No CSS value may contain parentheses.** One rule removes `url(…)` — a remote
fetch from a renderer that must fetch nothing, and the CSS-exfiltration shape
where an attribute selector's background image leaks a value byte by byte —
plus `expression(…)`, `-moz-binding`, and every function-shaped obfuscation.
The price is `rgb()` and `calc()`; hex colours and fixed sizes cover what an
invoice layout needs.

**`<img>` may only carry a `data:image/*` source.** `allowedSchemes` is empty
and `allowedSchemesByTag` grants `data` to `img` alone, then a second DOM pass
drops any `src` that is not an inline image payload. A relative path would
survive scheme filtering; a `data:text/html` payload is a document, not a
picture. Both are dropped.

## The corpus

`sanitise-rich-text-html.adversarial.spec.ts` — **47 vectors**, each checked
against 21 forbidden output patterns, then checked again for idempotence.
It is a regression suite, not a one-off: a future widening of the allowlist
that reopens any of these fails CI.

| Family | Vectors | Result |
| --- | --- | --- |
| Script-bearing elements (`script`, `iframe`, `object`, `embed`, `link`, `style`, `base`, `meta`, `form`) | 11 | all dropped |
| Event-handler attributes (`onerror`, `onload`, mixed case, whitespace before `=`, on table cells) | 6 | all dropped |
| URL schemes (`javascript:`, tab-interleaved, uppercased, `vbscript:`, `data:text/html`, protocol-relative, absolute, relative) | 8 | all dropped |
| CSS (remote `url()`, escaped-parenthesis `url()`, `expression()`, `-moz-binding`, exfiltration shapes, fixed-position overlay) | 6 | all dropped |
| SVG / MathML parser-context switches (inline `svg`, `svg onload`, `foreignObject`, `annotation-xml`) | 4 | all dropped |
| Mutation and encoding (nested `<scr<script>ipt>`, unclosed, comment-wrapped, `noscript` breakout, entity-encoded handler, split tag name, attribute-borne closing tag, caption breakout, smuggled semicolon, `template`) | 12 | all dropped |

The assertions are **invariants over the output**, not expected strings. An
expected string tests what the sanitiser happens to do today; an invariant
tests what it must never do, and survives a legitimate widening of the
allowlist. Adding a vector is one line.

### Idempotence

Every vector is also asserted to be a fixed point: sanitising the output again
returns it unchanged. A sanitiser whose output is not a fixed point is the
classic mXSS shape — the first pass produces markup a second parse reads
differently, and somewhere downstream something parses it twice.

## Reviewed decisions — kept deliberately

### Inline SVG referenced from `<img>` survives

`<img src="data:image/svg+xml;base64,…">` is allowed. **Reviewed and kept.**

Chromium renders an SVG referenced from `<img>` in a restricted mode: no
script execution, no external references. The renderer has no network in any
case (D-026). Banning it would break a clinic whose logo is a vector file, for
no gain against this threat model. Inline `<svg>` in the document body is a
different thing entirely and is dropped.

Revisit if the rendering path ever changes to one that loads the HTML as a
document in a context where SVG scripts execute — e.g. if a preview were ever
served to a browser from an origin that could reach the app's cookies.

### The element allowlist

Reviewed element by element. `pre`, `code` and `blockquote` are not used by
invoice layouts, but E5's agreements, consents and clinic policies are drafted
in the same editor and do use them, so they stay. Nothing in the list is
unreachable from a real authoring surface. `img` is the clinic logo. Table
elements are the line-item block.

Nothing was removed as unused; nothing unused was found.

### `class` is allowed and carries no CSS

`class` survives on every element. There is no author stylesheet in the render
pipeline — `buildInvoiceDocumentHtml` composes the document — so a class name
selects nothing. It is kept because the editor emits it and stripping it would
churn stored HTML on every save for no security gain.

## The `sanitize-html` pin, and why it cannot move casually

Pinned to **`sanitize-html@2.17.4`** with the **`htmlparser2@9`** family.

Newer `sanitize-html` releases are ESM-only and break the API's CommonJS
build. This is a build constraint, not a security one, but it has a security
consequence: **an upgrade for a published advisory cannot be a one-line bump.**
It requires either moving the API build to ESM or vendoring the fix.

**Upgrade procedure:** watch `sanitize-html` advisories directly rather than
waiting for a transitive alert. If one lands, the adversarial corpus above is
the acceptance test — add the advisory's proof-of-concept as a vector first,
watch it fail, then fix.

## Verification

```bash
pnpm --filter @hms/api exec jest --config ./jest.config.cjs \
  src/common/html/sanitise-rich-text-html.adversarial.spec.ts
```

Runs in CI with the rest of the unit suite. 95 assertions, no network, no
database.
