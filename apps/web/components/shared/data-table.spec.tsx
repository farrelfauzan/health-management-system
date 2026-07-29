import { render, screen } from '@testing-library/react';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { describe, expect, it } from 'vitest';

import { DataTable } from './data-table';
import { DataTableHeaderCell } from './data-table-header-cell';
import { DataTableMonoCell } from './data-table-mono-cell';

describe('DataTable', () => {
  it('renders header cells in the uppercase heading slot', () => {
    render(
      <DataTable>
        <TableHeader>
          <TableRow>
            <DataTableHeaderCell>Patient</DataTableHeaderCell>
          </TableRow>
        </TableHeader>
      </DataTable>,
    );

    const headerCell = screen.getByRole('columnheader', { name: 'Patient' });
    expect(headerCell.className).toContain('font-heading');
    expect(headerCell.className).toContain('uppercase');
    expect(headerCell.className).toContain('bg-slate-50');
  });

  it('keeps the frame inside its column and scrolls the table instead', () => {
    const { container } = render(
      <DataTable>
        <TableBody>
          <TableRow>
            <DataTableMonoCell>MRN-00042</DataTableMonoCell>
          </TableRow>
        </TableBody>
      </DataTable>,
    );

    const frame = container.firstElementChild;
    expect(frame?.className).toContain('max-w-full');
    expect(frame?.className).toContain('overflow-x-auto');
    // The table keeps a readable minimum width so a narrow viewport scrolls
    // rather than compressing every column into wrapped text.
    expect(screen.getByRole('table').className).toContain('min-w-[56rem]');
  });

  it('accepts a narrower scroll threshold for a table with few columns', () => {
    render(
      <DataTable minWidthClassName="min-w-[32rem]">
        <TableBody>
          <TableRow>
            <DataTableMonoCell>MRN-00042</DataTableMonoCell>
          </TableRow>
        </TableBody>
      </DataTable>,
    );

    expect(screen.getByRole('table').className).toContain('min-w-[32rem]');
  });

  it('renders ID/number cells in the Geist Mono slot', () => {
    render(
      <DataTable>
        <TableBody>
          <TableRow>
            <DataTableMonoCell>MRN-00042</DataTableMonoCell>
          </TableRow>
        </TableBody>
      </DataTable>,
    );

    const monoCell = screen.getByRole('cell', { name: 'MRN-00042' });
    expect(monoCell.className).toContain('font-mono');
  });
});
