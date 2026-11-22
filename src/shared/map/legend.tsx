import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { rgbaToCss, SAFETY_COLORS, SAFETY_RING_STYLES } from '@/shared/theme/tokens';

export interface LegendItem {
  label: ReactNode;
  color: string;
  shape?: 'dot' | 'ring' | 'ring-dashed' | 'line' | 'square' | 'arrow';
}

function Swatch({ color, shape = 'dot' }: Pick<LegendItem, 'color' | 'shape'>) {
  switch (shape) {
    case 'ring':
    case 'ring-dashed':
      return (
        <span
          className={cn(
            'size-3.5 rounded-full border-2',
            shape === 'ring-dashed' && 'border-dashed',
          )}
          style={{ borderColor: color }}
        />
      );
    case 'line':
      return <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: color }} />;
    case 'square':
      return <span className="size-3 rounded-[3px]" style={{ backgroundColor: color }} />;
    case 'arrow':
      return (
        <svg viewBox="0 0 12 12" className="size-3.5" aria-hidden>
          <path d="M6 0.5 10.5 11 6 8.5 1.5 11Z" fill={color} />
        </svg>
      );
    default:
      return <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />;
  }
}

/** Collapsible legend panel for map layers. */
export function MapLegend({
  title,
  items,
  className,
  defaultOpen = true,
}: {
  title?: ReactNode;
  items: readonly LegendItem[];
  className?: string;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('glass-panel w-56 rounded-lg border text-xs shadow-elevated', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 font-semibold"
      >
        {title ?? t('map.legend')}
        <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
      </button>
      {open && (
        <ul className="space-y-1.5 border-t px-3 py-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <span className="flex w-4 justify-center">
                <Swatch color={item.color} shape={item.shape} />
              </span>
              <span className="text-muted-foreground">{item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Legend of the vessel safety ring colours. */
export function VesselSafetyLegend({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <MapLegend
      className={className}
      items={[
        { label: t('map.safety.normal'), color: '#f5b301', shape: 'arrow' },
        ...(
          [
            ['ewsDanger', 'map.safety.danger'],
            ['ewsWarning', 'map.safety.warning'],
            ['collisionHigh', 'map.safety.collisionHigh'],
            ['collisionMedium', 'map.safety.collisionMedium'],
          ] as const
        ).map(([kind, labelKey]) => ({
          label: t(labelKey),
          color: rgbaToCss(SAFETY_COLORS[kind]),
          shape:
            SAFETY_RING_STYLES[kind].line === 'dashed'
              ? ('ring-dashed' as const)
              : ('ring' as const),
        })),
      ]}
    />
  );
}
