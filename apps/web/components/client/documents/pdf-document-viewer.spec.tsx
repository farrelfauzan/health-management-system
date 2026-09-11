import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { PdfDocumentViewer } from './pdf-document-viewer';
import sharedMessages from '../../../messages/en/shared.json';

const { pageProps } = vi.hoisted(() => ({ pageProps: vi.fn() }));

// pdf.js needs a canvas and a worker, neither of which jsdom has. The mock
// keeps react-pdf's contract: Document reports its page count once loaded and
// renders its Page children; Page records the props it was given.
vi.mock('react-pdf', async () => {
  const { useEffect } = await import('react');
  return {
    pdfjs: { GlobalWorkerOptions: {} },
    Document: function MockDocument({
      file,
      options,
      onLoadSuccess,
      children,
    }: {
      file: string;
      options: { isEvalSupported?: boolean };
      onLoadSuccess?: (document: { numPages: number }) => void;
      children: React.ReactNode;
    }) {
      useEffect(() => {
        onLoadSuccess?.({ numPages: 3 });
        // Once, like a real load.
      }, []);
      return (
        <div
          data-testid="pdf-document"
          data-file={file}
          data-eval={String(options.isEvalSupported)}
        >
          {children}
        </div>
      );
    },
    Page: function MockPage(props: { pageNumber: number }) {
      pageProps(props);
      return <div>page {props.pageNumber}</div>;
    },
  };
});

function renderViewer() {
  return render(
    <NextIntlClientProvider locale="en" messages={sharedMessages}>
      <PdfDocumentViewer url="https://signed.example/doc.pdf" />
    </NextIntlClientProvider>,
  );
}

describe('PdfDocumentViewer', () => {
  it('loads the file from the signed link and starts on the first page', async () => {
    renderViewer();

    expect(await screen.findByText('page 1')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-document')).toHaveAttribute(
      'data-file',
      'https://signed.example/doc.pdf',
    );
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('steps through the pages and stops at either end', async () => {
    const user = userEvent.setup();
    renderViewer();
    await screen.findByText('page 1');

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('page 3')).toBeInTheDocument();
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('keeps script and live links off: no eval, no annotation layer', async () => {
    renderViewer();
    await screen.findByText('page 1');

    expect(screen.getByTestId('pdf-document')).toHaveAttribute('data-eval', 'false');
    expect(pageProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ renderAnnotationLayer: false, renderTextLayer: false }),
    );
  });
});
