import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownContent } from './markdown-content';

describe('MarkdownContent', () => {
  it('renders headings, emphasis and a GitHub-flavoured table', () => {
    render(
      <MarkdownContent
        markdown={
          '# Jam layanan\n\nKlinik buka **Senin–Sabtu**.\n\n| Hari | Jam |\n| --- | --- |\n| Sabtu | 08.00–14.00 |'
        }
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Jam layanan' })).toBeInTheDocument();
    expect(screen.getByText('Senin–Sabtu').tagName).toBe('STRONG');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '08.00–14.00' })).toBeInTheDocument();
  });

  it('drops raw HTML in the Markdown instead of rendering it', () => {
    const { container } = render(
      <MarkdownContent
        markdown={'Halo <img src=x onerror="alert(1)"> <b>tebal</b>\n\n<script>alert(1)</script>'}
      />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('does not render Markdown images, so a document cannot make the app fetch a URL', () => {
    const { container } = render(
      <MarkdownContent markdown={'![logo](https://tracker.example/pixel.png)'} />,
    );

    expect(container.querySelector('img')).toBeNull();
  });

  it('opens links in a new tab with no way back into this one', () => {
    render(<MarkdownContent markdown={'[Situs klinik](https://klinik.example)'} />);

    const actualLink = screen.getByRole('link', { name: 'Situs klinik' });
    expect(actualLink).toHaveAttribute('href', 'https://klinik.example');
    expect(actualLink).toHaveAttribute('target', '_blank');
    expect(actualLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('empties a javascript: link target', () => {
    render(<MarkdownContent markdown={'[klik](javascript:alert(1))'} />);

    expect(screen.getByText('klik').closest('a')?.getAttribute('href') ?? '').toBe('');
  });
});
