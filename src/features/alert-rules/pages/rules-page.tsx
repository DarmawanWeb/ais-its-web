import {
  BellPlus,
  BellRing,
  CircleCheck,
  Radio,
  Search,
  SlidersHorizontal,
  Webhook,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import type { AlertRuleDto } from '@/shared/api/generated/notification/model';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { PagePaginationBar } from '@/shared/domain-ui/data-table/pagination-bar';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import {
  RULES_PAGE_SIZE,
  useDeleteRule,
  useDeliverySummary,
  useOrganizations,
  useRotateSecret,
  useRules,
  useToggleRule,
} from '../api/rules-api';
import { DeliveriesSheet } from '../components/deliveries-sheet';
import { RuleCard } from '../components/rule-card';
import { RuleEditor } from '../components/rule-editor';
import { SigningSecretDialog } from '../components/signing-secret-dialog';
import { TestRuleDialog } from '../components/test-rule-dialog';
import { WebhookGuide } from '../components/webhook-guide';
import { useLiveDeliveries } from '../hooks/use-live-deliveries';
import { useRuleActor } from '../hooks/use-rule-actor';
import { countChannels, revealedSecrets, shortTarget } from '../lib/channels';
import { problemMessage } from '@/shared/api/problem-copy';
import { canModifyRule } from '../lib/scope';

type StatusFilter = 'all' | 'enabled' | 'disabled';
const ALL_ORGS = '__all__';

function RulesSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-busy>
      {[0, 1, 2, 3].map((key) => (
        <Skeleton key={key} className="h-64 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Alert routing rules (notification service, spec §13.9). */
export function RulesPage() {
  const { t, i18n } = useTranslation('alert-rules');
  const actor = useRuleActor();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [orgFilter, setOrgFilter] = useState<string>(ALL_ORGS);
  const [testing, setTesting] = useState<AlertRuleDto | null>(null);
  const [deleting, setDeleting] = useState<AlertRuleDto | null>(null);
  /** Webhook channel whose signing secret is about to be rotated (confirmation open). */
  const [rotating, setRotating] = useState<{ rule: AlertRuleDto; index: number } | null>(null);
  /** A rule response with new signing secrets (shown once). */
  const [revealed, setRevealed] = useState<AlertRuleDto | null>(null);

  useLiveDeliveries();
  const organizations = useOrganizations(actor.isPlatformAdmin);
  const orgNames = useMemo(
    () => new Map((organizations.data?.data ?? []).map((org) => [org.id, org.name])),
    [organizations.data],
  );
  const rules = useRules({
    page,
    orgId: actor.isPlatformAdmin && orgFilter !== ALL_ORGS ? orgFilter : undefined,
    enabled: status === 'all' ? undefined : status === 'enabled',
  });
  const summary = useDeliverySummary();
  const toggle = useToggleRule();
  const remove = useDeleteRule();
  const rotate = useRotateSecret();

  const list = useMemo(() => rules.data?.data ?? [], [rules.data]);
  const term = search.trim().toLowerCase();
  const visible = term ? list.filter((rule) => rule.name.toLowerCase().includes(term)) : list;
  const editId = params.get('rule');
  const historyId = params.get('history');
  const editing = editId && editId !== 'new' ? list.find((rule) => rule.id === editId) : undefined;
  const historyRule = historyId ? (list.find((rule) => rule.id === historyId) ?? null) : null;

  const setParam = (key: 'rule' | 'history', value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const stats = useMemo(() => {
    const channels = countChannels(list.flatMap((rule) => rule.channels));
    const counts = summary.data;
    return {
      enabled: list.filter((rule) => rule.enabled).length,
      channels,
      totalChannels: channels.email + channels.telegram + channels.webhook,
      // Success rate and last delivery over the whole period, counted by the service.
      rate:
        counts?.successRate === null || counts?.successRate === undefined
          ? null
          : counts.successRate * 100,
      failed: counts?.failed ?? 0,
      sample: counts?.total ?? 0,
      last: counts?.lastDeliveredAt ?? null,
    };
  }, [list, summary.data]);

  const onToggle = (rule: AlertRuleDto, enabled: boolean) =>
    toggle.mutate(
      { id: rule.id, enabled },
      {
        onSuccess: () =>
          toast.success(
            enabled
              ? t('toasts.enabled', { name: rule.name })
              : t('toasts.disabled', { name: rule.name }),
          ),
        onError: (error) =>
          toast.error(t('toasts.toggleFailed'), { description: problemMessage(t, error) }),
      },
    );

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting);
      toast.success(t('toasts.deleted', { name: deleting.name }));
      if (historyId === deleting.id) setParam('history', null);
    } catch (error) {
      toast.error(t('toasts.deleteFailed'), { description: problemMessage(t, error) });
    } finally {
      setDeleting(null);
    }
  };

  const showSecrets = (rule: AlertRuleDto) => {
    if (revealedSecrets(rule).length > 0) setRevealed(rule);
  };

  const confirmRotate = async () => {
    if (!rotating) return;
    try {
      const rule = await rotate.mutateAsync({ id: rotating.rule.id, index: rotating.index });
      toast.success(t('toasts.secretRotated', { name: rule.name }));
      showSecrets(rule);
    } catch (error) {
      toast.error(t('toasts.rotateFailed'), { description: problemMessage(t, error) });
    } finally {
      setRotating(null);
    }
  };
  const rotatingChannel = rotating ? rotating.rule.channels[rotating.index] : undefined;

  const filtered = status !== 'all' || term !== '' || orgFilter !== ALL_ORGS;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.settings')}
        title={t('rules.title')}
        description={t('rules.description')}
        icon={SlidersHorizontal}
        actions={
          <>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Webhook /> {t('webhook.open')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl" closeLabel={t('common:actions.close')}>
                <DialogHeader>
                  <DialogTitle>{t('webhook.dialogTitle')}</DialogTitle>
                  <DialogDescription>{t('webhook.dialogDescription')}</DialogDescription>
                </DialogHeader>
                <WebhookGuide />
              </DialogContent>
            </Dialog>
            <Button onClick={() => setParam('rule', 'new')}>
              <BellPlus /> {t('rules.create')}
            </Button>
          </>
        }
      />

      <section
        aria-label={t('stats.label')}
        className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
      >
        <StatCard
          label={t('stats.active')}
          value={rules.isPending ? '—' : formatNumber(stats.enabled, i18n.language)}
          unit={
            rules.isPending ? undefined : t('stats.ofTotal', { total: rules.data?.meta.total ?? 0 })
          }
          icon={BellRing}
          tone="primary"
          loading={rules.isPending}
        />
        <StatCard
          label={t('stats.channels')}
          value={rules.isPending ? '—' : formatNumber(stats.totalChannels, i18n.language)}
          description={t('stats.channelsBreakdown', stats.channels)}
          icon={Radio}
          loading={rules.isPending}
        />
        <StatCard
          label={t('stats.successRate')}
          value={
            stats.rate === null
              ? '—'
              : formatNumber(stats.rate, i18n.language, { maximumFractionDigits: 1 })
          }
          unit={stats.rate === null ? undefined : '%'}
          description={
            stats.sample > 0
              ? t('stats.successSample', { count: stats.sample, failed: stats.failed })
              : t('stats.noDeliveries')
          }
          methodId="notify.delivery_retry_backoff"
          icon={CircleCheck}
          tone={stats.failed > 0 ? 'warning' : 'success'}
          loading={summary.isPending}
        />
        <StatCard
          label={t('stats.lastDelivery')}
          value={
            stats.last ? (
              // A phrase, not a figure: smaller sans type so it fits a half-width tile.
              <span className="font-sans text-lg leading-tight font-semibold tracking-normal">
                {formatRelativeTime(stats.last, i18n.language)}
              </span>
            ) : (
              '—'
            )
          }
          description={t('stats.lastDeliveryHint')}
          icon={Webhook}
          loading={summary.isPending}
        />
      </section>

      <section aria-labelledby="rules-list-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="rules-list-title" className="text-base font-semibold tracking-tight">
            {t('rules.listTitle')}
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('rules.searchPlaceholder')}
                aria-label={t('rules.search')}
                className="pl-8 sm:w-60"
                type="search"
              />
            </div>
            <ToggleGroup
              type="single"
              value={status}
              onValueChange={(value) => {
                if (!value) return;
                setStatus(value as StatusFilter);
                setPage(1);
              }}
              aria-label={t('rules.statusFilter')}
              className="rounded-md border bg-muted/40 p-0.5"
            >
              {(['all', 'enabled', 'disabled'] as const).map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {t(`rules.status.${value}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {actor.isPlatformAdmin && (
              <Select
                value={orgFilter}
                onValueChange={(value) => {
                  setOrgFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="sm:w-56" aria-label={t('rules.orgFilter')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ORGS}>{t('rules.allOrganizations')}</SelectItem>
                  {(organizations.data?.data ?? []).map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {rules.isPending ? (
          <RulesSkeleton />
        ) : rules.isError ? (
          <div className="rounded-xl border bg-surface">
            <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-surface/50">
            {filtered ? (
              <EmptyState
                icon={Search}
                title={t('rules.noMatches')}
                description={t('rules.noMatchesHint')}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setStatus('all');
                      setOrgFilter(ALL_ORGS);
                    }}
                  >
                    {t('common:actions.reset')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={BellRing}
                title={t('rules.empty')}
                description={t('rules.emptyHint')}
                action={
                  <Button onClick={() => setParam('rule', 'new')}>
                    <BellPlus /> {t('rules.createFirst')}
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visible.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                orgName={actor.isPlatformAdmin ? (orgNames.get(rule.orgId) ?? null) : null}
                canModify={canModifyRule(actor, rule)}
                toggling={toggle.isPending && toggle.variables?.id === rule.id}
                onToggle={(enabled) => onToggle(rule, enabled)}
                onEdit={() => setParam('rule', rule.id)}
                onDeliveries={() => setParam('history', rule.id)}
                onTest={() => setTesting(rule)}
                onDelete={() => setDeleting(rule)}
                onRotateSecret={(index) => setRotating({ rule, index })}
              />
            ))}
          </div>
        )}
        {(rules.data?.meta.total ?? 0) > RULES_PAGE_SIZE && (
          <PagePaginationBar
            pagination={{
              mode: 'page',
              page,
              pageSize: RULES_PAGE_SIZE,
              total: rules.data?.meta.total ?? 0,
              onPageChange: setPage,
            }}
          />
        )}
      </section>

      <RuleEditor
        open={editId === 'new' || editing !== undefined}
        onOpenChange={(open) => !open && setParam('rule', null)}
        rule={editing}
        actor={actor}
        organizations={organizations.data?.data}
        onSaved={showSecrets}
      />
      <SigningSecretDialog
        ruleName={revealed?.name ?? ''}
        secrets={revealed ? revealedSecrets(revealed) : []}
        onClose={() => setRevealed(null)}
      />
      <ConfirmDialog
        open={rotating !== null}
        onOpenChange={(open) => !open && setRotating(null)}
        title={t('rotate.title', {
          target: rotatingChannel ? shortTarget(rotatingChannel) : '',
        })}
        description={t('rotate.description')}
        confirmLabel={t('rotate.confirm')}
        destructive
        onConfirm={confirmRotate}
      />
      <DeliveriesSheet
        rule={historyRule}
        onOpenChange={(open) => !open && setParam('history', null)}
      />
      <TestRuleDialog rule={testing} onOpenChange={(open) => !open && setTesting(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('delete.title', { name: deleting?.name ?? '' })}
        description={t('delete.description')}
        confirmLabel={t('delete.confirm')}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
