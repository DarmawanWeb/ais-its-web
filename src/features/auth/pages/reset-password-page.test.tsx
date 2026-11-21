import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderApp } from '@/test/render';

import { readLinkToken } from '../lib/link-token';

describe('reset password / accept invite', () => {
  it('reads the token from the fragment or the query string', () => {
    expect(readLinkToken('#token=abc', '')).toBe('abc');
    expect(readLinkToken('', '?token=def')).toBe('def');
    expect(readLinkToken('', '')).toBeNull();
  });

  it('sets a new password and strips the token from the URL', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ session: null, route: '/reset-password#token=reset-token' });
    await user.type(await screen.findByLabelText('Kata sandi baru'), 'KapalLaut2026');
    await user.type(screen.getByLabelText('Ulangi kata sandi'), 'KapalLaut2026');
    expect(router.state.location.hash).toBe('');
    await user.click(screen.getByRole('button', { name: 'Simpan kata sandi' }));
    expect(await screen.findByText('Kata sandi diperbarui')).toBeInTheDocument();
  });

  it('enforces the password rule of spec §13.1', async () => {
    const user = userEvent.setup();
    renderApp({ session: null, route: '/accept-invite?token=reset-token' });
    await user.type(await screen.findByLabelText('Kata sandi baru'), 'hanyahuruf');
    await user.type(screen.getByLabelText('Ulangi kata sandi'), 'berbeda');
    await user.click(screen.getByRole('button', { name: 'Aktifkan akun' }));
    expect(await screen.findByText('Harus berisi huruf dan angka')).toBeInTheDocument();
    expect(screen.getByText('Kata sandi tidak sama')).toBeInTheDocument();
  });

  it('explains a missing token', async () => {
    renderApp({ session: null, route: '/reset-password' });
    expect(await screen.findByText('Tautan tidak lengkap')).toBeInTheDocument();
  });
});
