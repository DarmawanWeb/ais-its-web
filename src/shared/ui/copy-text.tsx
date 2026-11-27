import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { CopyButton } from '@/shared/ui/copy-button';

const SCROLL_REGION = { tabIndex: 0 } as const;

/**
 * A monospace value (topic, URL, command, JSON) with a copy button; long content scrolls inside
 * its box and the box is keyboard reachable (axe `scrollable-region-focusable`).
 *
 *   <CopyText label="Topik MQTT" value={topic} />
 *   <CopyText label="Payload (JSON)" value={json} multiline showLabel />
 */
export function CopyText({
  label,
  value,
  multiline = false,
  showLabel = false,
  className,
}: {
  label: string;
  value: string;
  /** Keep line breaks (JSON, commands) and scroll vertically past 18 rem. */
  multiline?: boolean;
  /** Show `label` above the box (otherwise it only names the box and the button). */
  showLabel?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      {showLabel && (
        <p id={labelId} className="text-xs font-medium text-muted-foreground">
          {label}
        </p>
      )}
      <div className="group relative min-w-0">
        <pre
          // A scrolling box must be keyboard reachable (axe scrollable-region-focusable).
          {...SCROLL_REGION}
          role="group"
          {...(showLabel ? { 'aria-labelledby': labelId } : { 'aria-label': label })}
          className={cn(
            'overflow-x-auto rounded-md border bg-background/70 py-2 pr-11 pl-3 font-mono text-xs leading-relaxed',
            multiline ? 'max-h-72 overflow-y-auto whitespace-pre' : 'whitespace-nowrap',
          )}
        >
          {value}
        </pre>
        <CopyButton
          value={value}
          label={t('actions.copyValue', { label })}
          className="absolute top-1 right-1"
        />
      </div>
    </div>
  );
}
