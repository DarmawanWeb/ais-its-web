import { cn } from '@/shared/lib/utils';

/** Product mark: the legacy AIS radar logo on a sea-cyan tile, plus the wordmark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5',
        className,
      )}
    >
      <img src="/logo.png" alt="" className="size-[78%] object-contain" draggable={false} />
    </span>
  );
}

export function BrandLogo({
  className,
  collapsed = false,
  subtitle,
}: {
  className?: string;
  collapsed?: boolean;
  subtitle?: string;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark />
      {!collapsed && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold tracking-tight">AIS Maritime</span>
          <span className="truncate text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {subtitle ?? 'Intelligence'}
          </span>
        </span>
      )}
    </span>
  );
}
