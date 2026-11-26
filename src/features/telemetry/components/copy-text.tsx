import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { CopyButton } from '@/shared/ui/copy-button';

const SCROLL_REGION = { tabIndex: 0 } as const;

/** A monospace value (topic, URL, JSON) with a copy button; long content scrolls in its box. */
export function CopyText({
  label,
  value,
  multiline = false,
  className,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('telemetry');
  return (
    <div className={cn('group relative min-w-0', className)}>
      <pre
        // Scrollable content must be keyboard reachable (axe scrollable-region-focusable).
        {...SCROLL_REGION}
        role="group"
        aria-label={label}
        className={cn(
          'overflow-x-auto rounded-md border bg-background/70 py-2 pr-11 pl-3 font-mono text-xs',
          multiline ? 'max-h-72 overflow-y-auto whitespace-pre' : 'whitespace-nowrap',
        )}
      >
        {value}
      </pre>
      <CopyButton
        value={value}
        label={t('copy.copy', { label })}
        className="absolute top-1 right-1"
      />
    </div>
  );
}
