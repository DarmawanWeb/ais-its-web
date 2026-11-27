import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type {
  AlertRuleDto,
  AlertRulePageDto,
  CreateAlertRuleDto,
  DeliveryDto,
  DeliveryPageDto,
  DeliverySummaryDto,
  UpdateAlertRuleDto,
} from '@/shared/api/generated/notification/model';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render';
import { TEST_IDS } from '@/test/tokens';

const APP = { timeout: 10_000 };
const AT = '2026-11-20T08:00:00.000Z';
const KEY_ID = '0192f0c8-7d3a-7c2e-9a30-000000000011';
const ROTATED_KEY_ID = '0192f0c8-7d3a-7c2e-9a30-000000000012';

const RULES: AlertRuleDto[] = [
  {
    id: '0192f0c8-7d3a-7c2e-9a20-000000000001',
    orgId: TEST_IDS.orgA,
    createdBy: TEST_IDS.user,
    name: 'EWS kritis armada',
    scope: 'org',
    types: ['ews'],
    domains: [],
    minSeverity: 'critical',
    mmsi: [],
    zoneIds: [],
    channels: [
      { type: 'telegram', target: '-1001234567890', keyId: null, signingSecret: null },
      { type: 'email', target: 'ops@pelni.test', keyId: null, signingSecret: null },
    ],
    locale: 'id',
    quietMinutes: 30,
    enabled: true,
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: '0192f0c8-7d3a-7c2e-9a20-000000000002',
    orgId: TEST_IDS.orgA,
    createdBy: TEST_IDS.user,
    name: 'Pengawasan lintas tenant',
    scope: 'all',
    types: [],
    domains: ['surveillance'],
    minSeverity: 'warning',
    mmsi: [],
    zoneIds: [],
    channels: [
      {
        type: 'webhook',
        target: 'https://ops.pelni.test/hooks/ais',
        keyId: null,
        signingSecret: null,
      },
    ],
    locale: 'en',
    quietMinutes: 0,
    enabled: false,
    createdAt: AT,
    updatedAt: AT,
  },
];

const DELIVERIES: DeliveryDto[] = [
  {
    id: '0192f0c8-7d3a-7c2e-9a1f-000000000101',
    alertId: '0192f0c8-7d3a-7c2e-9a1b-0000000a1e01',
    ruleId: RULES[0]!.id,
    channel: 'telegram',
    target: '-1001234567890',
    severity: 'critical',
    status: 'sent',
    attempts: 1,
    error: null,
    nextAttemptAt: AT,
    lastAttemptAt: AT,
    sentAt: AT,
    createdAt: AT,
  },
  {
    id: '0192f0c8-7d3a-7c2e-9a1f-000000000102',
    alertId: '0192f0c8-7d3a-7c2e-9a1b-0000000a1e02',
    ruleId: RULES[0]!.id,
    channel: 'email',
    target: 'ops@pelni.test',
    severity: 'critical',
    status: 'failed',
    attempts: 6,
    error: 'SMTP 550 mailbox unavailable',
    nextAttemptAt: AT,
    lastAttemptAt: AT,
    sentAt: null,
    createdAt: AT,
  },
];

const problem = (status: number, code: string, title: string) =>
  HttpResponse.json(
    { type: `urn:ais-its:problem:${code.toLowerCase()}`, status, code, title },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

function mockRules({
  rules = RULES,
  listError = false,
}: { rules?: AlertRuleDto[]; listError?: boolean } = {}) {
  const state = {
    rules: structuredClone(rules),
    created: [] as CreateAlertRuleDto[],
    patched: [] as { id: string; body: UpdateAlertRuleDto }[],
    rotated: [] as { id: string; index: number }[],
    deliveryParams: [] as URLSearchParams[],
  };
  server.use(
    http.get('*/api/v2/alert-rules', () =>
      listError
        ? problem(500, 'INTERNAL_ERROR', 'Internal error')
        : HttpResponse.json({
            data: state.rules,
            meta: { page: 1, pageSize: 100, total: state.rules.length },
          } satisfies AlertRulePageDto),
    ),
    http.post('*/api/v2/alert-rules', async ({ request }) => {
      const body = (await request.json()) as CreateAlertRuleDto;
      state.created.push(body);
      const rule: AlertRuleDto = {
        id: '0192f0c8-7d3a-7c2e-9a20-000000000099',
        orgId: TEST_IDS.orgA,
        createdBy: TEST_IDS.user,
        name: body.name,
        scope: 'org',
        types: body.types ?? [],
        domains: body.domains ?? [],
        minSeverity: body.minSeverity ?? 'info',
        mmsi: body.mmsi ?? [],
        zoneIds: body.zoneIds ?? [],
        // notification 0.2: a new webhook channel gets its key; the secret is in this response only
        channels: body.channels.map((channel) =>
          channel.type === 'webhook'
            ? { ...channel, keyId: KEY_ID, signingSecret: 'whsec_created_once' }
            : { ...channel, keyId: null, signingSecret: null },
        ),
        locale: body.locale ?? 'id',
        quietMinutes: body.quietMinutes ?? 0,
        enabled: body.enabled ?? true,
        createdAt: AT,
        updatedAt: AT,
      };
      state.rules.push({
        ...rule,
        channels: rule.channels.map((channel) => ({ ...channel, signingSecret: null })),
      });
      return HttpResponse.json(rule, { status: 201 });
    }),
    http.post('*/api/v2/alert-rules/:id/channels/:index/rotate-secret', ({ params }) => {
      state.rotated.push({ id: String(params.id), index: Number(params.index) });
      const rule = state.rules.find((item) => item.id === params.id)!;
      return HttpResponse.json({
        ...rule,
        channels: rule.channels.map((channel, index) =>
          index === Number(params.index)
            ? { ...channel, keyId: ROTATED_KEY_ID, signingSecret: 'whsec_rotated_once' }
            : channel,
        ),
      } satisfies AlertRuleDto);
    }),
    http.patch('*/api/v2/alert-rules/:id', async ({ params, request }) => {
      const body = (await request.json()) as UpdateAlertRuleDto;
      state.patched.push({ id: String(params.id), body });
      const { channels, ...rest } = body;
      state.rules = state.rules.map((rule) =>
        rule.id === params.id
          ? {
              ...rule,
              ...rest,
              ...(channels
                ? { channels: channels.map((c) => ({ keyId: null, signingSecret: null, ...c })) }
                : {}),
            }
          : rule,
      );
      return HttpResponse.json(state.rules.find((rule) => rule.id === params.id));
    }),
    http.get('*/api/v2/notifications/deliveries/summary', () =>
      HttpResponse.json({
        from: '2026-10-24T00:00:00.000Z',
        to: '2026-11-23T00:00:00.000Z',
        sent: 1,
        failed: 1,
        pending: 0,
        queued: 0,
        total: 2,
        lastDeliveredAt: '2026-11-22T08:00:00.000Z',
        successRate: 0.5,
      } satisfies DeliverySummaryDto),
    ),
    http.get('*/api/v2/notifications/deliveries', ({ request }) => {
      const url = new URL(request.url);
      state.deliveryParams.push(url.searchParams);
      const ruleId = url.searchParams.get('ruleId');
      const data = DELIVERIES.filter((delivery) => !ruleId || delivery.ruleId === ruleId);
      return HttpResponse.json({
        data,
        page: { nextCursor: null, limit: 25 },
      } satisfies DeliveryPageDto);
    }),
    http.get('*/api/v2/zones', () =>
      HttpResponse.json({ data: [], meta: { page: 1, pageSize: 100, total: 0 } }),
    ),
  );
  return state;
}

describe('alert rules page', { timeout: 30_000 }, () => {
  it('lists rules with conditions, channels and delivery stats; locks cross-tenant rules', async () => {
    mockRules();
    renderApp({ route: '/alert-rules', session: { roles: ['org_admin'] } });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Aturan Alert' }, APP),
    ).toBeInTheDocument();
    const cards = await screen.findAllByTestId('rule-card');
    expect(cards).toHaveLength(2);
    const first = within(cards[0]!);
    expect(first.getByRole('heading', { name: 'EWS kritis armada' })).toBeInTheDocument();
    expect(first.getByText('Peringatan dini pipa bawah laut')).toBeInTheDocument();
    expect(first.getByText('-1001234567890')).toBeInTheDocument();
    expect(first.getByRole('switch', { name: 'Aktifkan aturan EWS kritis armada' })).toBeEnabled();
    // A rule watching every vessel can only be changed by the organization's authority members.
    const second = within(cards[1]!);
    expect(second.getByText('Semua kapal')).toBeInTheDocument();
    expect(second.getByRole('switch')).toBeDisabled();
    expect(second.getByText('Hanya otoritas')).toBeInTheDocument();
    // Delivery stats counted by the service over 30 days (1 sent, 1 failed).
    expect(await screen.findByText('2 pengiriman 30 hari terakhir · 1 gagal')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('explains how to start when there is no rule', async () => {
    mockRules({ rules: [] });
    renderApp({ route: '/alert-rules', session: { roles: ['fleet_manager'] } });
    expect(await screen.findByText('Belum ada aturan alert', {}, APP)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buat aturan pertama/ })).toBeInTheDocument();
  });

  it('shows the problem of a failed list with a retry', async () => {
    mockRules({ listError: true });
    renderApp({ route: '/alert-rules', session: { roles: ['fleet_manager'] } });
    const alert = await screen.findByRole('alert', {}, APP);
    expect(within(alert).getByText('Server mengalami gangguan')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /Coba lagi/ })).toBeInTheDocument();
  });

  it('creates a rule with whole domains and validates channels first', async () => {
    const state = mockRules();
    const user = userEvent.setup();
    renderApp({ route: '/alert-rules', session: { roles: ['fleet_manager'] } });
    await user.click(await screen.findByRole('button', { name: /Buat aturan/ }, APP));
    const sheet = await screen.findByRole('dialog', { name: 'Aturan alert baru' });
    // Not an authority member: the scope is fixed to the organization's fleet.
    expect(within(sheet).getByText('Armada organisasi')).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText('Nama aturan'), 'Kapal gelap & transhipment');
    await user.click(within(sheet).getByRole('checkbox', { name: 'Pengawasan' }));
    await user.type(within(sheet).getByLabelText('Tujuan kanal 1'), 'ops@');
    await user.click(within(sheet).getByRole('button', { name: 'Buat aturan' }));
    expect(await within(sheet).findByText('Alamat email tidak valid')).toBeInTheDocument();
    expect(state.created).toHaveLength(0);

    await user.type(within(sheet).getByLabelText('Tujuan kanal 1'), 'pelni.test');
    await user.click(within(sheet).getByRole('button', { name: 'Buat aturan' }));
    expect(
      await screen.findByText('Aturan "Kapal gelap & transhipment" dibuat'),
    ).toBeInTheDocument();
    expect(state.created).toEqual([
      {
        name: 'Kapal gelap & transhipment',
        enabled: true,
        locale: 'id',
        types: [],
        domains: ['surveillance'],
        minSeverity: 'warning',
        mmsi: [],
        zoneIds: [],
        channels: [{ type: 'email', target: 'ops@pelni.test' }],
        quietMinutes: 60,
      },
    ]);
  });

  it('shows the signing secret of a new webhook once and rotates it on request', async () => {
    const state = mockRules({ rules: [] });
    const user = userEvent.setup();
    renderApp({ route: '/alert-rules?rule=new', session: { roles: ['fleet_manager'] } });
    const sheet = await screen.findByRole('dialog', { name: 'Aturan alert baru' }, APP);
    await user.type(within(sheet).getByLabelText('Nama aturan'), 'Integrasi SIEM');
    await user.type(within(sheet).getByLabelText('Tujuan kanal 1'), 'ops@pelni.test');
    await user.click(within(sheet).getByRole('button', { name: 'Webhook' }));
    await user.type(
      within(sheet).getByLabelText('Tujuan kanal 2'),
      'https://siem.pelni.test/hooks/ais',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Buat aturan' }));

    // The secret is shown once; the dialog stays until the user confirms they stored it.
    const secret = await screen.findByRole('dialog', {
      name: 'Simpan secret penandatanganan webhook',
    });
    expect(within(secret).getByTestId('webhook-signing-secret')).toHaveValue('whsec_created_once');
    expect(within(secret).getByText(KEY_ID)).toBeInTheDocument();
    const done = within(secret).getByRole('button', { name: 'Selesai' });
    expect(done).toBeDisabled();
    await user.click(
      within(secret).getByRole('checkbox', {
        name: 'Saya sudah menyimpan secret ini di tempat yang aman',
      }),
    );
    await user.click(done);
    await waitFor(() => expect(screen.queryByTestId('webhook-signing-secret')).toBeNull());

    // Rotation: confirm, then the new secret (and key id) is shown once.
    const [card] = await screen.findAllByTestId('rule-card');
    await user.click(within(card!).getByRole('button', { name: 'Aksi aturan Integrasi SIEM' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ganti secret webhook' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Ganti secret siem.pelni.test/hooks/ais?',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Ganti secret' }));
    const rotated = await screen.findByRole('dialog', {
      name: 'Simpan secret penandatanganan webhook',
    });
    expect(within(rotated).getByTestId('webhook-signing-secret')).toHaveValue('whsec_rotated_once');
    expect(within(rotated).getByText(ROTATED_KEY_ID)).toBeInTheDocument();
    expect(state.rotated).toEqual([{ id: '0192f0c8-7d3a-7c2e-9a20-000000000099', index: 1 }]);
  });

  it('lets authority members choose the scope', async () => {
    mockRules();
    const user = userEvent.setup();
    renderApp({ route: '/alert-rules?rule=new', session: { roles: ['authority'] } });
    const sheet = await screen.findByRole('dialog', { name: 'Aturan alert baru' }, APP);
    expect(within(sheet).getByRole('radio', { name: /Semua kapal/ })).toBeChecked();
    await user.click(within(sheet).getByRole('radio', { name: /Armada organisasi/ }));
    expect(within(sheet).getByRole('radio', { name: /Armada organisasi/ })).toBeChecked();
  });

  it('disables a rule and opens its delivery history', async () => {
    const state = mockRules();
    const user = userEvent.setup();
    renderApp({ route: '/alert-rules', session: { roles: ['org_admin'] } });
    const [card] = await screen.findAllByTestId('rule-card', {}, APP);
    await user.click(
      within(card!).getByRole('switch', { name: 'Aktifkan aturan EWS kritis armada' }),
    );
    await waitFor(() =>
      expect(state.patched).toEqual([{ id: RULES[0]!.id, body: { enabled: false } }]),
    );
    expect(await screen.findByText('Aturan "EWS kritis armada" dinonaktifkan')).toBeInTheDocument();

    await user.click(
      within(card!).getByRole('button', { name: /Riwayat pengiriman: EWS kritis armada/ }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Riwayat pengiriman' });
    const items = await within(sheet).findAllByTestId('delivery-item');
    expect(items).toHaveLength(2);
    expect(within(sheet).getByText('SMTP 550 mailbox unavailable')).toBeInTheDocument();
    expect(within(items[0]!).getByRole('link', { name: /Buka alert/ })).toHaveAttribute(
      'href',
      `/alerts?alert=${DELIVERIES[0]!.alertId}`,
    );
    expect(state.deliveryParams.some((params) => params.get('ruleId') === RULES[0]!.id)).toBe(true);
  });

  it('is forbidden without alert_rule:write', async () => {
    mockRules();
    renderApp({ route: '/alert-rules', session: { roles: ['viewer'] } });
    expect(await screen.findByText('Akses ditolak', {}, APP)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Buat aturan/ })).not.toBeInTheDocument();
  });
});
