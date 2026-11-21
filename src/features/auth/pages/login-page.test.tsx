import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { sessionStore } from '@/shared/auth/session';
import { authMock, DEFAULT_PASSWORD } from '@/test/msw/auth-handlers';
import { renderApp } from '@/test/render';

async function fillCredentials(password = DEFAULT_PASSWORD) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), 'nakhoda@pelni.test');
  await user.type(screen.getByLabelText('Kata sandi'), password);
  await user.click(screen.getByRole('button', { name: 'Masuk' }));
  return user;
}

describe('LoginPage', () => {
  it('signs in and returns to the requested page', async () => {
    const { router } = renderApp({ session: null, route: '/login?redirect=%2Fmethodology' });
    await fillCredentials();
    await waitFor(() => expect(router.state.location.pathname).toBe('/methodology'));
    expect(sessionStore.getState().status).toBe('authenticated');
  });

  it('shows the problem details message for wrong credentials', async () => {
    renderApp({ session: null, route: '/login' });
    await fillCredentials('wrong-password-1');
    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Email atau kata sandi salah.',
    );
  });

  it('explains throttling with the Retry-After countdown', async () => {
    authMock.throttleSeconds = 30;
    renderApp({ session: null, route: '/login' });
    await fillCredentials();
    expect(await screen.findByTestId('throttle-alert')).toHaveTextContent(
      /Coba lagi dalam (30|29) detik/,
    );
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeDisabled();
  });

  it('asks for the 6-digit code when MFA is enabled', async () => {
    authMock.mfaEnabled = true;
    const { router } = renderApp({ session: null, route: '/login' });
    const user = await fillCredentials();
    expect(
      await screen.findByRole('heading', { name: 'Verifikasi dua langkah' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Kode verifikasi'), '123456');
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
  });

  it('validates the form before calling the API', async () => {
    const user = userEvent.setup();
    renderApp({ session: null, route: '/login' });
    await user.click(await screen.findByRole('button', { name: 'Masuk' }));
    expect(await screen.findByText('Email wajib diisi')).toBeInTheDocument();
    expect(screen.getByText('Kata sandi wajib diisi')).toBeInTheDocument();
  });
});
