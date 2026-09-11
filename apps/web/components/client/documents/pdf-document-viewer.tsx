'use client';

import { useRef, useState } from 'react';
import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { Document, Page, pdfjs } from 'react-pdf';

import { useElementWidth } from '#hooks/use-element-width';

// Set in the module that renders, as react-pdf recommends, so the worker is
// configured before the first <Document> mounts. This module is only ever
// loaded on the client (see DocumentPreviewDialog).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/**
 * `isEvalSupported: false` stops pdf.js compiling font programs with
 * `new Function` — the path CVE-2024-4367 used to run script from a crafted
 * PDF. Range requests and streaming are off so the file arrives as one plain
 * GET, the only request the bucket's CORS rule admits.
 */
const PDF_DOCUMENT_OPTIONS = {
  isEvalSupported: false,
  disableRange: true,
  disableStream: true,
};

const FIRST_PAGE = 1;

type PdfDocumentViewerProps = {
  url: string;
};

/**
 * A PDF rendered page by page onto a canvas, fitted to the dialog's width.
 *
 * The annotation layer is off, so links and form fields inside the file are
 * not live — nothing in an uploaded PDF can navigate the app — and the text
 * layer is off because the page is read, not copied from. One page at a
 * time keeps a long scan from rasterising every page up front.
 */
export function PdfDocumentViewer({ url }: PdfDocumentViewerProps) {
  const t = useTranslations('shared.documentPreview');
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(FIRST_PAGE);

  return (
    <div ref={containerRef} className="space-y-3">
      <Document
        file={url}
        options={PDF_DOCUMENT_OPTIONS}
        loading={t('loading')}
        error={t('loadError')}
        onLoadSuccess={({ numPages }) => {
          setPageCount(numPages);
          setPageNumber(FIRST_PAGE);
        }}
      >
        <Page
          pageNumber={pageNumber}
          width={width > 0 ? width : undefined}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          loading={t('loading')}
        />
      </Document>
      {pageCount > FIRST_PAGE ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t('previousPage')}
            disabled={pageNumber <= FIRST_PAGE}
            onClick={() => setPageNumber((current) => current - 1)}
          >
            <Icon name="chevron_left" size={18} />
          </Button>
          <span className="text-sm tabular-nums text-slate-600">
            {t('pageOf', { page: pageNumber, total: pageCount })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t('nextPage')}
            disabled={pageNumber >= pageCount}
            onClick={() => setPageNumber((current) => current + 1)}
          >
            <Icon name="chevron_right" size={18} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
