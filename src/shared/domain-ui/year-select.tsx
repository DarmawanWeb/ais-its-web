import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

/**
 * A labelled year picker (CII, SEEMP, reports). With `autoLabel` it offers an "automatic"
 * entry first, reported as `null` (e.g. "latest year with data").
 *
 *   <YearSelect id="cii-year" label={t('year')} value={year} years={years} onChange={setYear} />
 */
export function YearSelect<Auto extends string | undefined = undefined>({
  id,
  label,
  value,
  years,
  onChange,
  autoLabel,
  className,
}: {
  id: string;
  label: string;
  value: number | null;
  years: readonly number[];
  onChange: (year: Auto extends string ? number | null : number) => void;
  autoLabel?: Auto;
  className?: string;
}) {
  const auto = autoLabel !== undefined;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Label htmlFor={id} className="text-xs whitespace-nowrap text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value === null ? 'auto' : String(value)}
        onValueChange={(next) =>
          (onChange as (year: number | null) => void)(next === 'auto' ? null : Number(next))
        }
      >
        <SelectTrigger
          id={id}
          size="sm"
          // Years in the monospace figures font; the "automatic" label in the UI font.
          className={cn(value !== null && 'font-mono tabular-nums', auto ? 'w-32' : 'w-24')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {auto && (
            <SelectItem value="auto" className="font-sans">
              {autoLabel}
            </SelectItem>
          )}
          {years.map((year) => (
            <SelectItem key={year} value={String(year)} className="font-mono tabular-nums">
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
