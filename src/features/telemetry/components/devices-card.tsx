import { ArrowUpRight, Cpu, Router } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useDevicesControllerList } from '@/shared/api/generated/telemetry/devices/devices';
import { usePermission } from '@/shared/auth/hooks';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { Section } from '@/shared/domain-ui/section';
import { formatRelativeTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { CopyText } from './copy-text';

/**
 * Devices of the vessel (`GET /telemetry/devices?mmsi=`, `device:manage`); others see the count
 * and who manages devices. Registration and changes live on the admin devices page.
 */
export function DevicesCard({ mmsi, count }: { mmsi: number; count: number }) {
  const { t, i18n } = useTranslation('telemetry');
  const canManage = usePermission('device:manage');
  const devices = useDevicesControllerList(
    { mmsi, pageSize: 20 },
    { query: { enabled: canManage } },
  );
  const items = devices.data?.data ?? [];
  return (
    <Section
      title={t('devices.title')}
      description={t('devices.description', { count })}
      actions={
        canManage ? (
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/devices">
              {t('devices.manage')} <ArrowUpRight />
            </Link>
          </Button>
        ) : undefined
      }
    >
      {!canManage ? (
        <p className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <Cpu className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('devices.noPermission')}
        </p>
      ) : devices.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : devices.error ? (
        <ErrorState error={devices.error} onRetry={() => void devices.refetch()} size="sm" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Router}
          size="sm"
          title={t('devices.empty')}
          description={t('devices.emptyHint')}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/devices">{t('devices.register')}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-2">
          {items.map((device) => (
            <li key={device.id} className="grid gap-2 rounded-lg border bg-muted/15 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Router className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="truncate text-sm font-medium">{device.name}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Badge variant="outline" className="uppercase">
                    {device.kind}
                  </Badge>
                  <Badge variant={device.status === 'active' ? 'success' : 'muted'}>
                    {t(`status.${device.status}`)}
                  </Badge>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {device.lastSeenAt
                  ? t('devices.lastSeen', {
                      time: formatRelativeTime(device.lastSeenAt, i18n.language),
                    })
                  : t('devices.neverSeen')}
                {device.serialNumber &&
                  ` · ${t('devices.serial', { serial: device.serialNumber })}`}
              </p>
              {device.mqttTopic && <CopyText label={t('devices.topic')} value={device.mqttTopic} />}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
