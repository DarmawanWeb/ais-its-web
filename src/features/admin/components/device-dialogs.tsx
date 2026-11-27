import { zodResolver } from '@hookform/resolvers/zod';
import { Cable, Radio, Save, Webhook } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import * as z from 'zod';

import { useDevicesControllerConnection } from '@/shared/api/generated/telemetry/devices/devices';
import type { DeviceDto } from '@/shared/api/generated/telemetry/model';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { toApiProblem } from '@/shared/api/problem';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { CopyText } from '@/shared/ui/copy-text';
import { Spinner } from '@/shared/ui/spinner';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/sonner';

import { useApiKeys } from '../api/auth-admin';
import { useDeviceMutations } from '../api/devices';
import { useOrgVessels } from '../api/fleet-admin';
import {
  httpRequestExample,
  mqttCommandExample,
  mqttPayloadExample,
  mqttTopicOf,
} from '../lib/devices';
import { applyFieldErrors, problemMessage } from '@/shared/api/problem-copy';

const NONE = '__none__';

/** Registers or edits a telemetry device (vessel, kind, API key of http devices, status). */
export function DeviceFormDialog({
  open,
  onOpenChange,
  device,
  orgId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device?: DeviceDto;
  orgId: string | null;
  onCreated?: (device: DeviceDto) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DeviceForm
          key={device?.id ?? 'new'}
          device={device}
          orgId={orgId}
          onDone={() => onOpenChange(false)}
          onCreated={onCreated}
        />
      )}
    </Dialog>
  );
}

function DeviceForm({
  device,
  orgId,
  onDone,
  onCreated,
}: {
  device?: DeviceDto;
  orgId: string | null;
  onDone: () => void;
  onCreated?: (device: DeviceDto) => void;
}) {
  const { t } = useTranslation('admin');
  const { create, update } = useDeviceMutations();
  const ownerOrg = device?.orgId ?? orgId;
  const vessels = useOrgVessels(ownerOrg);
  const keys = useApiKeys({
    orgId: ownerOrg ?? undefined,
    includeRevoked: false,
    page: 1,
    pageSize: 100,
  });
  const telemetryKeys = (keys.data?.data ?? []).filter((key) =>
    key.scopes.includes('telemetry:ingest'),
  );
  const schema = z
    .object({
      mmsi: z.string().regex(/^\d{9}$/, t('devices.form.vesselRequired')),
      name: z
        .string()
        .trim()
        .min(1, t('devices.form.nameRequired'))
        .max(120, t('common.tooLong', { max: 120 })),
      kind: z.enum(['mqtt', 'http']),
      apiKeyId: z.string(),
      serialNumber: z
        .string()
        .trim()
        .max(120, t('common.tooLong', { max: 120 })),
      active: z.boolean(),
    })
    .refine(
      (values) => values.kind === 'mqtt' || (values.apiKeyId !== '' && values.apiKeyId !== NONE),
      {
        path: ['apiKeyId'],
        message: t('devices.form.apiKeyRequired'),
      },
    );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      mmsi: device ? String(device.mmsi) : '',
      name: device?.name ?? '',
      kind: device?.kind ?? 'mqtt',
      apiKeyId: device?.apiKeyId ?? NONE,
      serialNumber: device?.serialNumber ?? '',
      active: device ? device.status === 'active' : true,
    },
  });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const pending = create.isPending || update.isPending;

  const submit = form.handleSubmit(async (values) => {
    const apiKeyId = values.kind === 'http' && values.apiKeyId !== NONE ? values.apiKeyId : null;
    const serial = values.serialNumber.trim();
    try {
      if (device) {
        await update.mutateAsync({
          id: device.id,
          body: {
            mmsi: Number(values.mmsi),
            name: values.name.trim(),
            kind: values.kind,
            apiKeyId,
            status: values.active ? 'active' : 'inactive',
            serialNumber: serial || null,
          },
        });
        toast.success(t('devices.toasts.updated', { name: values.name.trim() }));
        onDone();
      } else {
        const created = await create.mutateAsync({
          mmsi: Number(values.mmsi),
          name: values.name.trim(),
          kind: values.kind,
          ...(apiKeyId ? { apiKeyId } : {}),
          status: values.active ? 'active' : 'inactive',
          ...(serial ? { serialNumber: serial } : {}),
        });
        toast.success(t('devices.toasts.created', { name: created.name }));
        onDone();
        onCreated?.(created);
      }
    } catch (error) {
      const problem = toApiProblem(error);
      if (problem.code === 'DEVICE_NAME_TAKEN')
        form.setError('name', { message: t('problems.DEVICE_NAME_TAKEN') });
      else if (problem.code === 'DEVICE_API_KEY_TAKEN')
        form.setError('apiKeyId', { message: t('problems.DEVICE_API_KEY_TAKEN') });
      else if (
        !applyFieldErrors(t, error, form.setError, [
          'mmsi',
          'name',
          'kind',
          'apiKeyId',
          'serialNumber',
        ])
      )
        toast.error(t('devices.toasts.saveFailed'), { description: problemMessage(t, error) });
    }
  });

  return (
    <DialogContent className="sm:max-w-xl" closeLabel={t('common:actions.close')}>
      <DialogHeader>
        <DialogTitle>
          {device ? t('devices.form.editTitle') : t('devices.form.createTitle')}
        </DialogTitle>
        <DialogDescription>{t('devices.form.description')}</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          id="device-form"
          onSubmit={(event) => void submit(event)}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="mmsi"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('devices.form.vessel')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          vessels.isPending
                            ? t('common:status.loading')
                            : t('devices.form.vesselPlaceholder')
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(vessels.data?.data ?? []).map((vessel) => (
                      <SelectItem key={vessel.id} value={String(vessel.mmsi)}>
                        {vessel.name}{' '}
                        <span className="font-mono text-xs text-muted-foreground">
                          {vessel.mmsi}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {device && <FormDescription>{t('devices.form.moveHint')}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('devices.form.name')}</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={120}
                      placeholder={t('devices.form.namePlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="serialNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('devices.form.serial')}</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={120}
                      className="font-mono"
                      placeholder="FM-2026-0042"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('devices.form.kind')}</FormLabel>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {(['mqtt', 'http'] as const).map((value) => {
                    const Icon = value === 'mqtt' ? Radio : Webhook;
                    return (
                      <Label
                        key={value}
                        htmlFor={`device-kind-${value}`}
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-lg border bg-background/40 p-3 font-normal hover:bg-accent/40',
                          field.value === value && 'border-primary/60 bg-primary/8',
                        )}
                      >
                        <RadioGroupItem
                          id={`device-kind-${value}`}
                          value={value}
                          className="mt-0.5"
                        />
                        <span className="space-y-0.5">
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            <Icon className="size-4 text-primary" aria-hidden />{' '}
                            {t(`devices.kinds.${value}`)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {t(`devices.form.kindHints.${value}`)}
                          </span>
                        </span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </FormItem>
            )}
          />
          {kind === 'http' && (
            <FormField
              control={form.control}
              name="apiKeyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('devices.form.apiKey')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('devices.form.apiKeyPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('devices.form.apiKeyNone')}</SelectItem>
                      {telemetryKeys.map((key) => (
                        <SelectItem key={key.id} value={key.id}>
                          {key.name}{' '}
                          <span className="font-mono text-xs text-muted-foreground">
                            {key.prefix}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t('devices.form.apiKeyHint')}{' '}
                    <Link to="/admin/api-keys" className="font-medium text-primary hover:underline">
                      {t('devices.form.apiKeyCreate')}
                    </Link>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="active"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-3 rounded-lg border bg-background/40 p-3">
                <div className="space-y-0.5">
                  <FormLabel>{t('devices.form.active')}</FormLabel>
                  <p className="text-xs text-muted-foreground">{t('devices.form.activeHint')}</p>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          {t('common:actions.cancel')}
        </Button>
        <Button type="submit" form="device-form" disabled={pending}>
          {pending ? <Spinner /> : <Save />}{' '}
          {device ? t('common:actions.save') : t('devices.form.create')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** How a device sends readings: MQTT topic and payload, or the HTTP request with its API key. */
export function ConnectionSheet({
  device,
  vesselName,
  onOpenChange,
}: {
  device: DeviceDto | null;
  vesselName: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('admin');
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  // Broker, TLS, QoS and the broker user of an MQTT device (`GET /devices/:id/connection`).
  const connection = useDevicesControllerConnection(device?.id ?? '', {
    query: { enabled: device?.kind === 'mqtt', staleTime: 5 * 60_000 },
  });
  const broker = connection.data;
  return (
    <Sheet open={device !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl" closeLabel={t('common:actions.close')}>
        <SheetHeader className="border-b p-5 pr-12">
          <SheetTitle className="flex items-center gap-2">
            <Cable className="size-5 text-primary" aria-hidden /> {t('devices.connection.title')}
          </SheetTitle>
          <SheetDescription>
            {device
              ? t('devices.connection.description', {
                  name: device.name,
                  vessel: vesselName ?? device.mmsi,
                })
              : ''}
          </SheetDescription>
        </SheetHeader>
        {device && (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 text-sm">
            {device.kind === 'mqtt' ? (
              <>
                <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground marker:text-foreground">
                  <li>{t('devices.connection.mqtt.broker')}</li>
                  <li>{t('devices.connection.mqtt.topic')}</li>
                  <li>{t('devices.connection.mqtt.payload')}</li>
                </ol>
                {broker && (
                  <KeyValueList
                    items={[
                      {
                        label: t('devices.connection.broker'),
                        value: broker.brokerUrl,
                        mono: true,
                      },
                      {
                        label: t('devices.connection.security'),
                        value: t(
                          broker.tls ? 'devices.connection.tls' : 'devices.connection.plain',
                          {
                            version: broker.protocolVersion,
                            qos: broker.qos,
                          },
                        ),
                      },
                      {
                        label: t('devices.connection.username'),
                        value:
                          broker.authentication === 'password' && broker.username
                            ? broker.username
                            : t('devices.connection.anonymous'),
                        mono: broker.authentication === 'password',
                      },
                    ]}
                  />
                )}
                <CopyText
                  showLabel
                  multiline
                  label={t('devices.connection.topic')}
                  value={broker?.topic ?? mqttTopicOf(device)}
                />
                <CopyText
                  showLabel
                  multiline
                  label={t('devices.connection.payloadLabel')}
                  value={mqttPayloadExample()}
                />
                <CopyText
                  showLabel
                  multiline
                  label={t('devices.connection.command')}
                  value={mqttCommandExample(
                    broker?.topic ?? mqttTopicOf(device),
                    new Date(),
                    broker,
                  )}
                />
              </>
            ) : (
              <>
                <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground marker:text-foreground">
                  <li>{t('devices.connection.http.key')}</li>
                  <li>{t('devices.connection.http.request')}</li>
                  <li>{t('devices.connection.http.vessel')}</li>
                </ol>
                <CopyText
                  showLabel
                  multiline
                  label={t('devices.connection.request')}
                  value={httpRequestExample(origin, device.mmsi)}
                />
              </>
            )}
            <div className="rounded-lg border bg-background/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">
                {t('devices.connection.rulesTitle')}
              </p>
              <ul className="list-disc space-y-1 pl-4">
                <li>{t('devices.connection.rules.units')}</li>
                <li>{t('devices.connection.rules.time')}</li>
                <li>{t('devices.connection.rules.unique')}</li>
                <li>{t('devices.connection.rules.active')}</li>
              </ul>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
