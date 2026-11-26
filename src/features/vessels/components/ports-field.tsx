import { ArrowDown, ArrowUp, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { PortDto } from '@/shared/api/generated/fleet/model';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

import { MAX_VESSEL_PORTS, type VesselFormValues } from '../lib/vessel-form';

/** Ordered ports of call (`PUT /vessels/:id/ports` order), unique, at most 50. */
export function PortsField({ ports }: { ports: readonly PortDto[] }) {
  const { t } = useTranslation('vessels');
  const { control } = useFormContext<VesselFormValues>();
  const { field, fieldState } = useController({ control, name: 'portIds' });
  const [pending, setPending] = useState('');
  const selected = field.value;
  const byId = new Map(ports.map((port) => [port.id, port]));
  const available = ports.filter((port) => !selected.includes(port.id));

  const move = (index: number, offset: -1 | 1) => {
    const next = [...selected];
    const target = index + offset;
    const [item] = next.splice(index, 1);
    if (item === undefined || target < 0 || target > next.length) return;
    next.splice(target, 0, item);
    field.onChange(next);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="vessel-port-add">{t('ports.add')}</Label>
          <Select value={pending} onValueChange={setPending}>
            <SelectTrigger
              id="vessel-port-add"
              className="w-full"
              disabled={selected.length >= MAX_VESSEL_PORTS}
            >
              <SelectValue
                placeholder={available.length ? t('ports.choose') : t('ports.noneLeft')}
              />
            </SelectTrigger>
            <SelectContent>
              {available.map((port) => (
                <SelectItem key={port.id} value={port.id}>
                  {port.name} · {port.code}
                  {port.administrativeLocation ? ` — ${port.administrativeLocation}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!pending}
          onClick={() => {
            if (!pending) return;
            field.onChange([...selected, pending]);
            setPending('');
          }}
        >
          {t('ports.addButton')}
        </Button>
      </div>
      {selected.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {t('ports.empty')}
        </p>
      ) : (
        <ol className="grid gap-2" aria-label={t('ports.order')}>
          {selected.map((id, index) => {
            const port = byId.get(id);
            return (
              <li
                key={id}
                className="flex items-center gap-3 rounded-lg border bg-muted/15 px-3 py-2"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 font-mono text-xs text-primary">
                  {index + 1}
                </span>
                <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {port ? port.name : id}
                  {port && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {port.code}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === 0}
                  aria-label={t('ports.up', { name: port?.name ?? id })}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === selected.length - 1}
                  aria-label={t('ports.down', { name: port?.name ?? id })}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="hover:text-danger"
                  aria-label={t('ports.remove', { name: port?.name ?? id })}
                  onClick={() => field.onChange(selected.filter((value) => value !== id))}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {fieldState.error?.message && (
        <p role="alert" className="text-xs font-medium text-danger">
          {fieldState.error.message}
        </p>
      )}
    </div>
  );
}
