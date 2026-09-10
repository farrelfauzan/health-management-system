import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FieldDescription } from './field-description';

describe('FieldDescription', () => {
  it('describes the input that references its id', () => {
    render(
      <div>
        <label htmlFor="code">Medication code</label>
        <input id="code" aria-describedby="code-description" />
        <FieldDescription id="code-description">Unique per item</FieldDescription>
      </div>,
    );

    expect(screen.getByRole('textbox', { name: 'Medication code' })).toHaveAccessibleDescription(
      'Unique per item',
    );
  });

  it('keeps the description out of the label text', () => {
    render(
      <div>
        <label htmlFor="code">Medication code</label>
        <input id="code" aria-describedby="code-description" />
        <FieldDescription id="code-description">Unique per item</FieldDescription>
      </div>,
    );

    expect(screen.getByRole('textbox')).toHaveAccessibleName('Medication code');
  });
});
