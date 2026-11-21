import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp, renderWithProviders } from '@/test/render';

import { Can, RequirePermission } from './guards';

describe('RequirePermission', () => {
  it('renders the page when the role grants the permission', () => {
    renderWithProviders(
      <RequirePermission permission="vessel:write">
        <p>vessel form</p>
      </RequirePermission>,
      { session: { roles: ['fleet_manager'] } },
    );
    expect(screen.getByText('vessel form')).toBeInTheDocument();
  });

  it('renders the 403 state when the permission is missing', () => {
    renderWithProviders(
      <RequirePermission permission="vessel:write">
        <p>vessel form</p>
      </RequirePermission>,
      { session: { roles: ['viewer'] } },
    );
    expect(screen.queryByText('vessel form')).not.toBeInTheDocument();
    expect(screen.getByText('Akses ditolak')).toBeInTheDocument();
  });

  it('lets super_admin through everything', () => {
    renderWithProviders(
      <>
        <RequirePermission permission="org:manage">
          <p>organizations</p>
        </RequirePermission>
        <Can permission={['audit:read']}>
          <button type="button">export audit</button>
        </Can>
      </>,
      { session: { roles: ['super_admin'], org: null } },
    );
    expect(screen.getByText('organizations')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'export audit' })).toBeInTheDocument();
  });
});

describe('route guards in the app', () => {
  it('redirects anonymous visitors to the login page with a redirect parameter', async () => {
    const { router } = renderApp({ session: null, route: '/cii' });
    expect(await screen.findByRole('heading', { name: 'Masuk ke konsol' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?redirect=%2Fcii');
  });

  it('shows 403 inside the shell for pages the role may not open', async () => {
    renderApp({ session: { roles: ['viewer'] }, route: '/admin/audit-log' });
    expect(await screen.findByText('Akses ditolak')).toBeInTheDocument();
  });

  it('hides navigation entries the role may not open', async () => {
    renderApp({ session: { roles: ['viewer'] }, route: '/methodology' });
    const nav = await screen.findByRole('navigation', { name: 'Navigasi utama' });
    expect(nav).toHaveTextContent('Peta Live');
    expect(nav).toHaveTextContent('Metodologi & Referensi');
    expect(nav).not.toHaveTextContent('Audit Log');
    expect(nav).not.toHaveTextContent('Telemetri');
  });
});
