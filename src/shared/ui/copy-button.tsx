import { Check, Copy, Link2 } from 'lucide-react';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';

import { Button } from './button';
import { toast } from './sonner';
import { SimpleTooltip } from './tooltip';

export interface CopyButtonProps {
  /** Text written to the clipboard. */
  value: string;
  /** Accessible name and tooltip of the icon button ("Salin ID akun"). */
  label: string;
  /** Visible text: renders a text button (no tooltip) instead of an icon button. */
  children?: ReactNode;
  /** Toast after a successful copy (none by default: the icon turns into a check). */
  successMessage?: string;
  icon?: 'copy' | 'link';
  size?: ComponentProps<typeof Button>['size'];
  variant?: ComponentProps<typeof Button>['variant'];
  className?: string;
}

/**
 * Copies `value` to the clipboard. The icon turns into a check and the name into "Disalin" for
 * 1.5 s; a failure (no clipboard, permission denied) shows a toast. Hidden when printing.
 */
export function CopyButton({
  value,
  label,
  children,
  successMessage,
  icon = 'copy',
  size,
  variant,
  className,
}: CopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (successMessage) toast.success(successMessage);
    } catch {
      toast.error(t('common:actions.copyFailed'));
    }
  };

  const Icon = copied ? Check : icon === 'link' ? Link2 : Copy;
  const withText = children !== undefined && children !== null && children !== false;
  const copiedLabel = t('common:actions.copied');
  const button = (
    <Button
      type="button"
      variant={variant ?? (withText ? 'outline' : 'ghost')}
      size={size ?? (withText ? 'sm' : 'icon-xs')}
      onClick={() => void copy()}
      aria-label={withText ? undefined : copied ? copiedLabel : label}
      className={cn('print:hidden', className)}
    >
      <Icon className={cn(copied && 'text-success')} aria-hidden />
      {withText && (copied ? copiedLabel : children)}
    </Button>
  );
  return withText ? (
    button
  ) : (
    <SimpleTooltip label={copied ? copiedLabel : label}>{button}</SimpleTooltip>
  );
}
