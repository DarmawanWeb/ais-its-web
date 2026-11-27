import { Cog, Droplets, FunctionSquare, Lock, MapPin, Ruler, Ship } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { VesselDetailDto, VesselEngineDto } from '@/shared/api/generated/fleet/model';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { KeyValueList, type KeyValueItem } from '@/shared/domain-ui/key-value-list';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { Section } from '@/shared/domain-ui/section';
import { MmsiText, UnitValue } from '@/shared/domain-ui/values';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';

import { evaluateFuelFormula } from '@/shared/lib/fuel-formula';
import { type AnyVessel, isDetailView } from '../lib/vessel';
import { FlagText } from './flag-text';
import { VesselStatusBadge } from './vessel-status-badge';

function useNumber() {
  const { i18n } = useTranslation();
  return (value: number | null | undefined, digits = 3) =>
    formatNumber(value ?? null, i18n.language, { maximumFractionDigits: digits });
}

function GroupTitle({ icon: Icon, children }: { icon: typeof Ship; children: ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      <Icon className="size-3.5 text-primary" aria-hidden />
      {children}
    </h3>
  );
}

function IdentitySection({ vessel }: { vessel: AnyVessel }) {
  const { t, i18n } = useTranslation('vessels');
  const detail = isDetailView(vessel) ? vessel : null;
  const items: KeyValueItem[] = [
    { key: 'name', label: t('fields.name'), value: vessel.name },
    { key: 'mmsi', label: t('fields.mmsi'), value: <MmsiText mmsi={vessel.mmsi} copyable /> },
    { key: 'imo', label: t('fields.imo'), value: vessel.imo ?? '—', mono: true },
    { key: 'flag', label: t('fields.flag'), value: <FlagText code={vessel.flag} /> },
    { key: 'type', label: t('fields.type'), value: vessel.type.name },
    {
      key: 'status',
      label: t('fields.status'),
      value: <VesselStatusBadge status={vessel.status} />,
    },
  ];
  if (detail) {
    items.push(
      { key: 'built', label: t('fields.builtYear'), value: detail.builtYear ?? '—', mono: true },
      {
        key: 'voyage',
        label: t('fields.annualVoyagePercentage'),
        value: <UnitValue value={detail.annualVoyagePercentage} unit="percent" />,
      },
      {
        key: 'updated',
        label: t('fields.updatedAt'),
        value: formatDateTime(detail.updatedAt, i18n.language),
      },
    );
  }
  return (
    <Section title={t('overview.identity')}>
      <KeyValueList items={items} columns={3} />
    </Section>
  );
}

function DimensionsSection({ vessel }: { vessel: VesselDetailDto }) {
  const { t } = useTranslation('vessels');
  const n = useNumber();
  const d = vessel.dimensions;
  const unitLabel = vessel.type.capacityUnit;
  const principal: KeyValueItem[] = [
    {
      key: 'capacity',
      label: t('fields.capacity', { unit: unitLabel }),
      hint: <MethodInfo methodId="cii.reference_line" />,
      value: (
        <span className="font-mono tabular-nums">
          {n(vessel.type.capacityFixed ?? d.capacity, 0)}
          {vessel.type.capacityFixed !== null && (
            <span className="ml-1 font-sans text-xs text-muted-foreground">
              {t('overview.capacityFixed')}
            </span>
          )}
        </span>
      ),
    },
    { key: 'gt', label: t('fields.gt'), value: n(d.gt, 0), mono: true },
    {
      key: 'dwt',
      label: t('fields.dwt'),
      value: <UnitValue value={d.dwt ?? null} unit="tonnes" digits={0} />,
    },
    { key: 'loa', label: t('fields.loa'), value: <UnitValue value={d.loa} unit="m" digits={2} /> },
    { key: 'lpp', label: t('fields.lpp'), value: <UnitValue value={d.lpp} unit="m" digits={2} /> },
    { key: 'lwl', label: t('fields.lwl'), value: <UnitValue value={d.lwl} unit="m" digits={2} /> },
    { key: 'b', label: t('fields.b'), value: <UnitValue value={d.b} unit="m" digits={2} /> },
    { key: 't', label: t('fields.t'), value: <UnitValue value={d.t} unit="m" digits={2} /> },
    { key: 'vs', label: t('fields.vs'), value: <UnitValue value={d.vs} unit="knots" /> },
  ];
  const hull: KeyValueItem[] = (['cb', 'cbnsp', 'cp', 'cm', 'cwp', 'cstern'] as const).map(
    (key) => ({
      key,
      label: t(`fields.${key}`),
      value: n(d[key], 4),
      mono: true,
    }),
  );
  hull.push({
    key: 'bulbousBow',
    label: t('fields.bulbousBow'),
    value: d.bulbousBow ? t('overview.yes') : t('overview.no'),
  });
  const rudder: KeyValueItem[] = (['c1', 'c2', 'c3', 'c5'] as const).map((key) => ({
    key,
    label: t(`fields.${key}`),
    value: n(d[key], 3),
    mono: true,
  }));
  return (
    <Section
      title={t('overview.dimensions')}
      description={t('overview.dimensionsDescription')}
      contentClassName="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
        <div>
          <GroupTitle icon={Ruler}>{t('overview.principal')}</GroupTitle>
          <KeyValueList items={principal} columns={3} dense />
        </div>
        <div>
          <GroupTitle icon={Cog}>{t('overview.rudder')}</GroupTitle>
          <KeyValueList items={rudder} columns={3} dense />
        </div>
      </div>
      <div>
        <GroupTitle icon={Ship}>
          <span className="inline-flex items-center gap-1">
            {t('overview.hull')} <MethodInfo methodId="resistance.hull_volumes_and_lengths" />
          </span>
        </GroupTitle>
        <KeyValueList items={hull} columns={2} dense />
      </div>
    </Section>
  );
}

function EngineCard({ row }: { row: VesselEngineDto }) {
  const { t } = useTranslation('vessels');
  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {row.role === 'main' ? t('engines.main') : t('engines.auxiliary')}
          </p>
          <p className="truncate font-semibold">{row.engine.name}</p>
        </div>
        <Badge variant={row.role === 'main' ? 'primary' : 'muted'} className="font-mono">
          × {row.quantity}
        </Badge>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ['powerKw', <UnitValue key="p" value={row.engine.powerKw} unit="kw" />],
            [
              'rpm',
              <span key="r" className="font-mono tabular-nums">
                {row.engine.rpm}
              </span>,
            ],
            ['sfoc', <UnitValue key="s" value={row.engine.sfoc} unit="gkwh" />],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="rounded-md bg-background/60 px-2 py-1.5">
            <dt className="text-[11px] text-muted-foreground">{t(`engines.${key}`)}</dt>
            <dd className="text-sm">{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function EnginesSection({ vessel }: { vessel: VesselDetailDto }) {
  const { t, i18n } = useTranslation('vessels');
  const installed = vessel.engines.reduce((sum, row) => sum + row.engine.powerKw * row.quantity, 0);
  return (
    <Section
      title={t('overview.engines')}
      description={
        vessel.engines.length > 0
          ? t('overview.installedPower', {
              power: formatNumber(installed, i18n.language, { maximumFractionDigits: 0 }),
            })
          : undefined
      }
    >
      {vessel.engines.length === 0 ? (
        <EmptyState
          icon={Cog}
          size="sm"
          title={t('overview.noEngines')}
          description={t('overview.noEnginesHint')}
        />
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {vessel.engines.map((row) => (
            <EngineCard key={`${row.role}:${row.engine.id}`} row={row} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function FormulaLine({ label, formula, vs }: { label: string; formula: string; vs: number }) {
  const { t, i18n } = useTranslation('vessels');
  const value = evaluateFuelFormula(formula, vs);
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <code className="block overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre">
        {formula}
      </code>
      <p className="text-xs text-muted-foreground">
        {value === null
          ? t('formula.previewUnavailable')
          : t('formula.previewAt', {
              speed: formatNumber(vs, i18n.language, { maximumFractionDigits: 1 }),
              value: formatNumber(Math.max(value, 0.5), i18n.language, {
                maximumFractionDigits: 3,
              }),
            })}
      </p>
    </div>
  );
}

function FuelSection({ vessel }: { vessel: VesselDetailDto }) {
  const { t } = useTranslation('vessels');
  const n = useNumber();
  const fuel = vessel.fuel;
  return (
    <Section
      title={t('overview.fuel')}
      contentClassName="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2"
    >
      <div>
        <GroupTitle icon={Droplets}>{fuel.name}</GroupTitle>
        <KeyValueList
          dense
          columns={2}
          items={[
            {
              key: 'cf',
              label: t('fields.conversionFactor'),
              hint: <MethodInfo methodId="emission.co2_conversion" />,
              value: n(fuel.conversionFactor, 3),
              mono: true,
            },
            {
              key: 'carbon',
              label: t('fields.carbonContent'),
              value: n(fuel.carbonContent, 4),
              mono: true,
            },
            {
              key: 'density',
              label: t('fields.density'),
              hint: <MethodInfo methodId="fuel.density_conversion" />,
              value: n(fuel.density, 3),
              mono: true,
            },
            { key: 'code', label: t('fields.code'), value: fuel.code, mono: true },
          ]}
        />
      </div>
      <div>
        <GroupTitle icon={FunctionSquare}>
          <span className="inline-flex items-center gap-1">
            {t('overview.firstFormula')} <MethodInfo methodId="fuel.first_formula" />
          </span>
        </GroupTitle>
        {vessel.firstFuelFormula ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{vessel.firstFuelFormula.name}</p>
            <FormulaLine
              label={t('formula.main')}
              formula={vessel.firstFuelFormula.mainEngineFormula}
              vs={vessel.dimensions.vs}
            />
            <FormulaLine
              label={t('formula.auxiliary')}
              formula={vessel.firstFuelFormula.auxiliaryEngineFormula}
              vs={vessel.dimensions.vs}
            />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {t('overview.noFormula')} <MethodInfo methodId="fuel.method_selection" />
          </p>
        )}
      </div>
    </Section>
  );
}

function PortsSection({ vessel }: { vessel: VesselDetailDto }) {
  const { t } = useTranslation('vessels');
  return (
    <Section title={t('overview.ports')}>
      {vessel.ports.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('overview.noPorts')}</p>
      ) : (
        <ol className="flex flex-wrap items-center gap-2">
          {vessel.ports.map((port, index) => (
            <li key={port.id} className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-3 py-1 text-sm">
                <MapPin className="size-3.5 text-primary" aria-hidden />
                {port.name}
                <span className="font-mono text-[11px] text-muted-foreground">{port.code}</span>
              </span>
              {index < vessel.ports.length - 1 && (
                <span className="text-muted-foreground" aria-hidden>
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/** Overview tab: identity for everyone, technical data for the owning organization (§8.5). */
export function OverviewTab({ vessel }: { vessel: AnyVessel }) {
  const { t } = useTranslation('vessels');
  if (!isDetailView(vessel)) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <IdentitySection vessel={vessel} />
        <div className="flex items-start gap-3 rounded-xl border border-dashed bg-surface/60 p-5">
          <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">{t('detail.restrictedTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('detail.restrictedDescription')}</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <IdentitySection vessel={vessel} />
      <DimensionsSection vessel={vessel} />
      <EnginesSection vessel={vessel} />
      <FuelSection vessel={vessel} />
      <PortsSection vessel={vessel} />
    </div>
  );
}
