import {
  BellOff,
  History,
  KeyRound,
  Lock,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';

import type { AlertRuleDto } from '@/shared/api/generated/notification/model';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Switch } from '@/shared/ui/switch';
import { SimpleTooltip } from '@/shared/ui/tooltip';

import { shortTarget } from '../lib/channels';
import {
  ChannelIcon,
  ConditionChips,
  MinSeverityBadge,
  ScopeBadge,
  VesselChips,
  ZoneChips,
} from './rule-bits';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-start">
      <dt className="pt-0.5 text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export interface RuleCardProps {
  rule: AlertRuleDto;
  /** Owner shown to platform administrators (rules of every organization). */
  orgName?: string | null;
  canModify: boolean;
  toggling: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDeliveries: () => void;
  onTest: () => void;
  onDelete: () => void;
  /** Rotate the signing secret of the webhook channel at `index` (shown when `canModify`). */
  onRotateSecret?: (index: number) => void;
}

/** One alert rule: what it watches, where it notifies and its switch. */
export function RuleCard({
  rule,
  orgName,
  canModify,
  toggling,
  onToggle,
  onEdit,
  onDeliveries,
  onTest,
  onDelete,
  onRotateSecret,
}: RuleCardProps) {
  const { t, i18n } = useTranslation('alert-rules');
  const titleId = useId();
  const webhooks = rule.channels.flatMap((channel, index) =>
    channel.type === 'webhook' ? [{ channel, index }] : [],
  );

  return (
    <article
      aria-labelledby={titleId}
      data-testid="rule-card"
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-xl border bg-surface p-4 shadow-xs transition-colors',
        !rule.enabled && 'bg-surface/60',
      )}
    >
      <header className="flex items-start gap-3">
        <span
          className={cn(
            'mt-1.5 size-2.5 shrink-0 rounded-full',
            rule.enabled
              ? 'bg-success shadow-[0_0_0_4px] shadow-success/15'
              : 'bg-muted-foreground/50',
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 id={titleId} className="truncate text-base font-semibold tracking-tight">
            {rule.name}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <ScopeBadge scope={rule.scope} />
            {!rule.enabled && (
              <Badge variant="muted">
                <BellOff aria-hidden /> {t('card.disabled')}
              </Badge>
            )}
            {orgName && <Badge variant="outline">{orgName}</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SimpleTooltip
            label={
              canModify
                ? rule.enabled
                  ? t('card.disable')
                  : t('card.enable')
                : t('card.lockedHint')
            }
          >
            <span>
              <Switch
                checked={rule.enabled}
                disabled={!canModify || toggling}
                onCheckedChange={onToggle}
                aria-label={t('card.toggleLabel', { name: rule.name })}
              />
            </span>
          </SimpleTooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('card.actions', { name: rule.name })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {canModify && (
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil /> {t('card.edit')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onDeliveries}>
                <History /> {t('card.deliveries')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onTest}>
                <Send /> {t('card.test')}
              </DropdownMenuItem>
              {canModify && onRotateSecret && webhooks.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {webhooks.map(({ channel, index }) => (
                    <DropdownMenuItem key={index} onSelect={() => onRotateSecret(index)}>
                      <KeyRound />
                      <span className="min-w-0 truncate">
                        {webhooks.length > 1
                          ? t('card.rotateSecretOf', { target: shortTarget(channel) })
                          : t('card.rotateSecret')}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {canModify && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={onDelete}
                    className="text-danger focus:bg-danger/10 focus:text-danger"
                  >
                    <Trash2 className="text-danger" /> {t('common:actions.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <dl className="space-y-3">
        <Row label={t('card.conditions')}>
          <span className="flex flex-wrap items-center gap-1.5">
            <ConditionChips types={rule.types} domains={rule.domains} />
            <MinSeverityBadge severity={rule.minSeverity} />
          </span>
        </Row>
        <Row label={t('card.vessels')}>
          <VesselChips mmsi={rule.mmsi} />
        </Row>
        <Row label={t('card.zones')}>
          <ZoneChips zoneIds={rule.zoneIds} />
        </Row>
        <Row label={t('card.channels')}>
          <span className="flex flex-wrap gap-1.5">
            {rule.channels.map((channel, index) => (
              <Badge key={`${channel.type}-${index}`} variant="secondary" className="max-w-64">
                <ChannelIcon type={channel.type} />
                <span className="sr-only">{t(`channels.types.${channel.type}`)}: </span>
                <span className="truncate font-mono text-[11px]">{shortTarget(channel)}</span>
                {channel.type === 'webhook' && (
                  <span className="sr-only">
                    {' '}
                    {channel.keyId
                      ? t('card.keyId', { keyId: channel.keyId })
                      : t('card.deploymentKey')}
                  </span>
                )}
              </Badge>
            ))}
            {webhooks.some(({ channel }) => !channel.keyId) && (
              <span className="basis-full text-xs text-warning">{t('card.deploymentKeyHint')}</span>
            )}
          </span>
        </Row>
      </dl>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            {rule.quietMinutes > 0
              ? t('card.quiet', { minutes: rule.quietMinutes })
              : t('card.noQuiet')}
            <MethodInfo methodId="notify.rule_quiet_period" />
          </span>
          <span>{t(`locales.${rule.locale}`)}</span>
          <span title={formatDateTime(rule.updatedAt, i18n.language)}>
            {t('card.updated', { time: formatRelativeTime(rule.updatedAt, i18n.language) })}
          </span>
        </span>
        {!canModify ? (
          <span className="inline-flex items-center gap-1 text-warning">
            <Lock className="size-3.5" aria-hidden /> {t('card.locked')}
          </span>
        ) : (
          <Button variant="ghost" size="xs" onClick={onDeliveries}>
            <History /> {t('card.deliveries')}
            <span className="sr-only">: {rule.name}</span>
          </Button>
        )}
      </footer>
    </article>
  );
}
