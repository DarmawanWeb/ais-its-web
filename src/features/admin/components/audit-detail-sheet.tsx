import { ArrowRight, FileJson } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { AuditLogDto } from '@/shared/api/generated/auth/model';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Button } from '@/shared/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';

import { actionKey, actionTone, describeMeta, formatMetaValue } from '../lib/audit';
import { CopyButton } from '@/shared/ui/copy-button';

const TONE_VARIANT = {
  danger: 'danger',
  warning: 'warning',
  success: 'success',
  default: 'primary',
} as const;

/** Badge of an audit action: the translated label when known, the raw action otherwise. */
export function ActionBadge({ action }: { action: string }) {
  const { t } = useTranslation('admin');
  const label = t(actionKey(action), { defaultValue: action });
  return (
    <span className="inline-flex min-w-0 flex-col">
      <Badge variant={TONE_VARIANT[actionTone(action)]} className="max-w-full">
        <span className="truncate">{label}</span>
      </Badge>
      {label !== action && (
        <span className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {action}
        </span>
      )}
    </span>
  );
}

/** One audit record with a readable diff of its metadata. */
export function AuditDetailSheet({
  record,
  actorName,
  orgName = null,
  onOpenChange,
}: {
  record: AuditLogDto | null;
  actorName: string | null;
  /** Name of the record's organization when known (the id is shown below it). */
  orgName?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation('admin');
  const meta = describeMeta(record?.meta);
  return (
    <Sheet open={record !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl" closeLabel={t('common:actions.close')}>
        <SheetHeader className="border-b p-5 pr-12">
          <SheetTitle>{t('auditLog.detail.title')}</SheetTitle>
          <SheetDescription>
            {record ? formatDateTime(record.at, i18n.language, 'dd MMM yyyy HH:mm:ss') : ''}
          </SheetDescription>
        </SheetHeader>
        {record && (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
            <div className="space-y-2">
              <ActionBadge action={record.action} />
            </div>
            <KeyValueList
              columns={2}
              items={[
                {
                  key: 'actor',
                  label: t('auditLog.detail.actor'),
                  value: (
                    <span className="inline-flex flex-col">
                      <span>{actorName ?? t(`auditLog.actorTypes.${record.actorType}`)}</span>
                      {record.actorId && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {record.actorId}
                        </span>
                      )}
                    </span>
                  ),
                },
                {
                  key: 'actorType',
                  label: t('auditLog.detail.actorType'),
                  value: t(`auditLog.actorTypes.${record.actorType}`),
                },
                {
                  key: 'target',
                  label: t('auditLog.detail.target'),
                  value: record.targetType ? (
                    <span className="inline-flex flex-col">
                      <span>
                        {t(`auditLog.targetTypes.${record.targetType}`, {
                          defaultValue: record.targetType,
                        })}
                      </span>
                      {record.targetId && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {record.targetId}
                        </span>
                      )}
                    </span>
                  ) : (
                    '—'
                  ),
                },
                {
                  key: 'source',
                  label: t('auditLog.detail.source'),
                  value: record.source,
                  mono: true,
                },
                { key: 'ip', label: t('auditLog.detail.ip'), value: record.ip ?? '—', mono: true },
                {
                  key: 'org',
                  label: t('auditLog.detail.org'),
                  value:
                    record.orgId && orgName ? (
                      <span className="inline-flex flex-col">
                        <span>{orgName}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {record.orgId}
                        </span>
                      </span>
                    ) : (
                      (record.orgId ?? '—')
                    ),
                  mono: !(record.orgId && orgName),
                },
                { key: 'id', label: t('auditLog.detail.id'), value: record.id, mono: true },
              ]}
            />
            {record.userAgent && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('auditLog.detail.userAgent')}
                </p>
                <p className="font-mono text-xs break-words">{record.userAgent}</p>
              </div>
            )}

            <section aria-labelledby="audit-changes" className="space-y-3">
              <h3 id="audit-changes" className="text-sm font-semibold">
                {t('auditLog.detail.changes')}
              </h3>
              {meta.changes.length === 0 &&
                meta.fields.length === 0 &&
                meta.entries.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('auditLog.detail.noMeta')}</p>
                )}
              {meta.changes.length > 0 && (
                <ul className="space-y-2" aria-label={t('auditLog.detail.changedValues')}>
                  {meta.changes.map((change) => (
                    <li key={change.key} className="rounded-lg border bg-background/40 p-3">
                      <p className="mb-1.5 font-mono text-xs text-muted-foreground">
                        {change.key === 'value' ? t('auditLog.detail.value') : change.key}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <del className="rounded bg-danger/10 px-1.5 py-0.5 font-mono text-xs text-danger [text-decoration-line:line-through] no-underline decoration-danger/60">
                          {formatMetaValue(change.from)}
                        </del>
                        <ArrowRight
                          className="size-3.5 text-muted-foreground"
                          aria-label={t('auditLog.detail.becomes')}
                        />
                        <ins className="rounded bg-success/10 px-1.5 py-0.5 font-mono text-xs text-success no-underline">
                          {formatMetaValue(change.to)}
                        </ins>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {meta.fields.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">{t('auditLog.detail.fields')}</span>
                  {meta.fields.map((field) => (
                    <Badge key={field} variant="outline" className="font-mono">
                      {field}
                    </Badge>
                  ))}
                </div>
              )}
              {meta.entries.length > 0 && (
                <dl className="divide-y rounded-lg border">
                  {meta.entries.map((entry) => (
                    <div
                      key={entry.key}
                      className="grid gap-1 px-3 py-2 sm:grid-cols-[10rem_minmax(0,1fr)]"
                    >
                      <dt className="font-mono text-xs text-muted-foreground">{entry.key}</dt>
                      <dd className="font-mono text-xs break-words">
                        {formatMetaValue(entry.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            <Collapsible>
              <div className="flex items-center justify-between gap-2">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <FileJson /> {t('auditLog.detail.raw')}
                  </Button>
                </CollapsibleTrigger>
                <CopyButton
                  value={JSON.stringify(record, null, 2)}
                  label={t('auditLog.detail.copyRaw')}
                />
              </div>
              <CollapsibleContent>
                <pre className="mt-2 max-h-80 overflow-auto rounded-lg border bg-background/70 p-3 font-mono text-[11px] leading-relaxed">
                  {JSON.stringify(record, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
