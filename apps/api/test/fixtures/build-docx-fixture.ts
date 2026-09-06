import JSZip from 'jszip';

/** A 1×1 red PNG — enough for the image pipeline to decode and re-encode. */
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

type DocxFixtureOptions = {
  readonly paragraphs?: readonly string[];
  readonly includeImage?: boolean;
  readonly includeTable?: boolean;
  readonly omitDocumentPart?: boolean;
};

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/**
 * Word writes style *names* here and style *ids* in the body; mammoth maps
 * on names, so a fixture without this part reads every heading as a plain
 * paragraph and reports an unrecognised style — exactly as a real file
 * saved without styles would.
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
</w:styles>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildParagraph(text: string, style?: string, isBold = false): string {
  const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  const runProperties = isBold ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:p>${properties}<w:r>${runProperties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function buildTable(): string {
  const cell = (text: string) =>
    `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${buildParagraph(text)}</w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr>${cell('Nomor')}${cell('{{invoice.number}}')}</w:tr><w:tr>${cell('Pasien')}${cell('{{patient.fullName}}')}</w:tr></w:tbl>`;
}

const IMAGE_PARAGRAPH = `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="381000" cy="381000"/><wp:docPr id="1" name="Logo" descr="Logo klinik"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="Logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImg1"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="381000" cy="381000"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

/**
 * Builds a minimal but genuine `.docx` in memory: the three parts Word
 * itself requires, optional table and embedded PNG, and whatever paragraphs
 * a spec needs — including `{{token}}` placeholders. Written with the same
 * ZIP library mammoth reads with, so a fixture that opens here opens there.
 */
export async function buildDocxFixture(options: DocxFixtureOptions = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  const paragraphs = options.paragraphs ?? ['Klinik Sehat Bersama'];
  const body = [
    buildParagraph(paragraphs[0] ?? '', 'Title'),
    ...paragraphs.slice(1).map((text) => buildParagraph(text, undefined, text.startsWith('**'))),
    options.includeTable ? buildTable() : '',
    options.includeImage ? IMAGE_PARAGRAPH : '',
  ].join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
  if (!options.omitDocumentPart) {
    zip.file('word/document.xml', document);
    zip.file('word/styles.xml', STYLES);
  }
  if (options.includeImage) {
    zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS);
    zip.file('word/media/image1.png', Buffer.from(TINY_PNG_BASE64, 'base64'));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
