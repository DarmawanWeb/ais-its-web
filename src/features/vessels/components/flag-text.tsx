import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';

import { flagName } from '../lib/vessel';

/** Flag state: ISO alpha-2 code chip and the country name in the UI language. */
export function FlagText({
  code,
  showName = true,
  className,
}: {
  code: string | null | undefined;
  showName?: boolean;
  className?: string;
}) {
  const { i18n } = useTranslation();
  if (!code) return <span className="text-muted-foreground">—</span>;
  const name = flagName(code, i18n.language);
  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-1.5', className)}
      title={name ?? code}
    >
      <span className="rounded border bg-muted px-1 font-mono text-[11px] leading-4 font-semibold">
        {code}
      </span>
      {showName && name && <span className="truncate">{name}</span>}
      {!showName && name && <span className="sr-only">{name}</span>}
    </span>
  );
}
