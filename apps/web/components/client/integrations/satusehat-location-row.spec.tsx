import type { SatusehatLocationNode } from '@hms/shared-types';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';
import { SatusehatLocationRow } from './satusehat-location-row';

function buildNode(overrides: Partial<SatusehatLocationNode> = {}): SatusehatLocationNode {
  return {
    kind: 'ROOM',
    id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    parentId: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
    depth: 2,
    name: 'Kamar Melati 1',
    code: 'MEL-01',
    isActive: true,
    satusehatLocationId: null,
    status: 'UNREGISTERED',
    blockReason: null,
    blockMessage: null,
    ...overrides,
  };
}

function renderRow(node: SatusehatLocationNode, onRegister = vi.fn(), canWrite = true): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <ul>
        <SatusehatLocationRow node={node} canWrite={canWrite} isPending={false} onRegister={onRegister} />
      </ul>
    </NextIntlClientProvider>,
  );
}

describe('SatusehatLocationRow', () => {
  it('offers "Daftarkan" on an unregistered row and sends that row', () => {
    const mockRegister = vi.fn();
    const inputNode = buildNode();

    renderRow(inputNode, mockRegister);
    fireEvent.click(screen.getByRole('button', { name: 'Daftarkan' }));

    expect(mockRegister).toHaveBeenCalledWith(inputNode);
  });

  it('shows why a blocked row waits and offers no action', () => {
    renderRow(
      buildNode({
        status: 'BLOCKED',
        blockReason: 'UNREGISTERED_PARENT',
        blockMessage: 'Register "Bangsal Melati" first',
      }),
    );

    expect(screen.getByText(/Register "Bangsal Melati" first/)).toBeInTheDocument();
    expect(screen.getByText('Tertahan')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers "Kirim perubahan" on a registered row and shows its SATUSEHAT id (FR-LOC-08)', () => {
    renderRow(buildNode({ status: 'REGISTERED', satusehatLocationId: 'b017aa54-f1df-4ec2-9d84-8823815d7228' }));

    expect(screen.getByRole('button', { name: 'Kirim perubahan' })).toBeInTheDocument();
    expect(screen.getByText(/b017aa54-f1df-4ec2-9d84-8823815d7228/)).toBeInTheDocument();
  });

  it('hides the action from a viewer without the write grant', () => {
    renderRow(buildNode(), vi.fn(), false);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
