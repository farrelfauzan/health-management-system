/**
 * The Code 128 symbol widths, values 0–106. Each entry is the run-length of
 * six alternating bars and spaces starting with a bar; the stop symbol (106)
 * carries a seventh run.
 *
 * A literal table rather than a dependency: the API has no barcode library, and
 * one deterministic 107-row constant is a smaller thing to own than a package
 * in the render path of a clinical document.
 */
const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

/** Code set B starts here; it covers ASCII 32–127, which is every character an order number uses. */
const START_CODE_B = 104;

const STOP_SYMBOL = 106;

/** Code set B maps a character to its symbol value by subtracting the space. */
const CODE_SET_B_OFFSET = 32;

const CODE_SET_B_MAX = 126;

const CHECKSUM_MODULUS = 103;

/** One module in user units. The SVG scales to its box, so this only sets the aspect. */
const MODULE_WIDTH = 1;

const SYMBOL_HEIGHT = 40;

const QUIET_ZONE_MODULES = 10;

/**
 * Encodes an order or accession number as a Code 128-B barcode, returned as an
 * SVG `data:` URI (`P18-T12`).
 *
 * A `data:` URI rather than a stored image because the barcode is a pure
 * function of the number: storing one would be a second copy of a fact that can
 * never disagree with itself, and a render that has the number can always draw
 * it. The renderer places only `data:` sources, so this is the shape it accepts.
 *
 * Returns null for anything Code set B cannot express, rather than encoding a
 * mangled approximation — a barcode that scans as the wrong number is worse
 * than no barcode, because the letter still looks scannable.
 */
export function encodeCode128Svg(value: string): string | null {
  const symbols = toSymbolValues(value);
  if (symbols === null) {
    return null;
  }
  const patterns = symbols.map((symbol) => CODE128_PATTERNS[symbol]);
  if (patterns.some((pattern) => pattern === undefined)) {
    return null;
  }

  return toDataUri(buildSvg(patterns.join('')));
}

/**
 * Start symbol, the payload, the modulo-103 checksum, then stop. The checksum
 * weights each payload symbol by its one-based position, which is what makes a
 * single transposed character fail to scan rather than scan as another number.
 */
function toSymbolValues(value: string): number[] | null {
  if (value.length === 0) {
    return null;
  }
  const payload: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < CODE_SET_B_OFFSET || codePoint > CODE_SET_B_MAX) {
      return null;
    }
    payload.push(codePoint - CODE_SET_B_OFFSET);
  }
  const weighted = payload.reduce(
    (total, symbol, index) => total + symbol * (index + 1),
    START_CODE_B,
  );

  return [START_CODE_B, ...payload, weighted % CHECKSUM_MODULUS, STOP_SYMBOL];
}

/**
 * Runs alternate bar, space, bar … starting with a bar, so every even-indexed
 * run is drawn and every odd one is skipped.
 */
function buildSvg(modules: string): string {
  const runs = [...modules].map((digit) => Number(digit));
  const totalModules = runs.reduce((total, run) => total + run, 0) + QUIET_ZONE_MODULES * 2;
  const bars: string[] = [];
  let cursor = QUIET_ZONE_MODULES;
  for (const [index, run] of runs.entries()) {
    const width = run * MODULE_WIDTH;
    if (index % 2 === 0) {
      bars.push(`<rect x="${cursor}" y="0" width="${width}" height="${SYMBOL_HEIGHT}"/>`);
    }
    cursor += width;
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${SYMBOL_HEIGHT}"`,
    ` width="${totalModules}" height="${SYMBOL_HEIGHT}" shape-rendering="crispEdges">`,
    `<rect x="0" y="0" width="${totalModules}" height="${SYMBOL_HEIGHT}" fill="#fff"/>`,
    `<g fill="#000">${bars.join('')}</g>`,
    '</svg>',
  ].join('');
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
