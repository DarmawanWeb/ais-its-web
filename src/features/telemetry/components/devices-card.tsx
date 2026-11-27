import { ArrowUpRight, Cpu, Router } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import {
  useDevicesControllerList,
  useVesselDevicesControllerList,
} from '@/shared/api/generated/telemetry/devices/devices';
import { usePermission } from '@/shared/auth/hooks';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { Section } from '@/shared/domain-ui/section';
import { formatRelativeTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { CopyText } from '@/shared/ui/copy-text';

interface DeviceItem {
  id: string;
  name: string;
  kind: string;
  status: string;
  lastSeenAt: string | null;
  serialNumber?: string | null;
  mqttTopic?: string | null;
}

/**
 * Devices of the vessel: with `device:manage` the registry (`GET /telemetry/devices?mmsi=`,
 * serial numbers and MQTT topics), otherwise the read-only list of
 * `GET /telemetry/vessels/:mmsi/devices` (`telemetry:read`). Registration and changes live on
 * the admin devices page.
 */
export function DevicesCard({ mmsi, count }: { mmsi: number; count: number }) {
  const { t, i18n } = useTranslation('telemetry');
  const canManage = usePermission('device:manage');
  const managed = useDevicesControllerList(
    { mmsi, pageSize: 20 },
    { query: { enabled: canManage } },
  );
  const readOnly = useVesselDevicesControllerList(
    String(mmsi),
    { pageSize: 20 },
    { query: { enabled: !canManage } },
  );
  const devices = canManage ? managed : readOnly;
  const items: DeviceItem[] = devices.data?.data ?? [];
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
      {devices.isPending ? (
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
            canManage ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/devices">{t('devices.register')}</Link>
              </Button>
            ) : undefined
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
      {!canManage && (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Cpu className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t('devices.readOnly')}
        </p>
      )}
    </Section>
  );
}
